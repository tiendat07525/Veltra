import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AttemptLimitService } from '../src/auth/attempt-limit.service';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { TwoFactorService } from '../src/auth/two-factor/two-factor.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { UsersService } from '../src/users/users.service';
import { FakeAttemptStore, fakeAttemptLimit } from './helpers/attempt-limit';

const MINUTE = 60_000;
const PASSWORD = 'right-pass-1';
const WRONG = 'wrong-pass-1';
const userId = new Types.ObjectId();
const id = userId.toString();

const statusOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error: unknown) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
};

describe('Wrong attempts per account', () => {
  let store: FakeAttemptStore;
  let limits: AttemptLimitService;
  let service: AuthService;
  let hash: string;
  let storedHash: string | undefined;
  const passwordRead = jest.fn();

  const usersService = {
    findByUsernameWithPassword: jest.fn(),
    findByIdWithPassword: jest.fn(),
    setPasswordHash: jest.fn(),
  };
  const twoFactor = {
    isEnabled: jest.fn(),
    createLoginChallenge: jest.fn(),
    completeLoginChallenge: jest.fn(),
    verifyCode: jest.fn(),
  };

  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    store = new FakeAttemptStore();
    limits = fakeAttemptLimit(store);
    storedHash = hash;
    const user = {
      _id: userId,
      username: 'alice',
      email: 'alice@example.test',
      get password() {
        passwordRead();
        return storedHash;
      },
    };
    // Same as the schema: the query value is trimmed and lowercased
    usersService.findByUsernameWithPassword.mockImplementation(
      (username: string) =>
        Promise.resolve(
          username.trim().toLowerCase() === 'alice' ? user : null,
        ),
    );
    usersService.findByIdWithPassword.mockResolvedValue(user);
    twoFactor.isEnabled.mockResolvedValue(false);
    twoFactor.createLoginChallenge.mockResolvedValue('c'.repeat(64));
    twoFactor.completeLoginChallenge.mockResolvedValue(id);
    service = new AuthService(
      usersService as unknown as UsersService,
      {
        signAsync: () => Promise.resolve('access'),
      } as unknown as JwtService,
      {
        createSession: () => Promise.resolve(),
        revokeAllUserSessions: () => Promise.resolve(),
      } as unknown as SessionService,
      { disconnectUser: jest.fn() } as unknown as RealtimeService,
      twoFactor as unknown as TwoFactorService,
      limits,
    );
  });

  const login = (password: string, ip = '203.0.113.1', username = 'alice') =>
    statusOf(service.login({ username, password }, 'agent', ip));
  const fail = async (times: number, ip?: string, username?: string) => {
    for (let i = 0; i < times; i++) {
      expect(await login(WRONG, ip, username)).toBe(401);
    }
  };

  describe('login', () => {
    it('refuses after 5 wrong passwords from one address, even with the right one', async () => {
      await fail(5);
      expect(await login(WRONG)).toBe(429);
      expect(await login(PASSWORD)).toBe(429);
    });

    it('says how long to wait and does not check the password', async () => {
      await fail(5);
      store.now += 4 * MINUTE;
      await expect(
        service.login(
          { username: 'alice', password: PASSWORD },
          'agent',
          '203.0.113.1',
        ),
      ).rejects.toThrow(
        'Bạn đã nhập sai quá nhiều lần, hãy thử lại sau 11 phút',
      );
      expect(passwordRead).toHaveBeenCalledTimes(5); // only the wrong ones
    });

    it('reopens 15 minutes after the first wrong one; refused tries do not extend it', async () => {
      await fail(5);
      store.now += 14 * MINUTE;
      expect(await login(PASSWORD)).toBe(429);
      store.now += 1 * MINUTE;
      expect(await login(PASSWORD)).toBe(200);
    });

    it('does not refuse the owner on another address', async () => {
      await fail(5);
      expect(await login(PASSWORD, '198.51.100.9')).toBe(200);
    });

    it('does not refuse another account on the same address', async () => {
      await fail(5, '203.0.113.1', 'bob_ghost');
      expect(await login(PASSWORD)).toBe(200);
    });

    it('treats every spelling of the username as one account', async () => {
      await fail(3, '203.0.113.1', 'alice');
      await fail(2, '203.0.113.1', ' ALICE ');
      expect(await login(PASSWORD)).toBe(429);
    });

    it('treats one IPv6 /64 as one address', async () => {
      for (let i = 1; i <= 5; i++) await fail(1, `2001:db8:1:2::${i}`);
      expect(await login(PASSWORD, '2001:db8:1:2:ffff::1')).toBe(429);
      expect(await login(PASSWORD, '2001:db8:1:3::1')).toBe(200);
    });

    it('refuses every address after 50 wrong passwords in an hour', async () => {
      for (let i = 0; i < 10; i++) await fail(5, `203.0.113.${i}`);
      expect(await login(PASSWORD, '198.51.100.9')).toBe(429);
      store.now += 60 * MINUTE;
      expect(await login(PASSWORD, '198.51.100.9')).toBe(200);
    });

    it('answers the same for a username that does not exist', async () => {
      await fail(5, '203.0.113.1', 'nobody_here');
      expect(await login(WRONG, '203.0.113.1', 'nobody_here')).toBe(429);
    });

    it('starts again from 0 after a successful login', async () => {
      await fail(4);
      expect(await login(PASSWORD)).toBe(200);
      await fail(4);
      expect(await login(PASSWORD)).toBe(200);
    });

    it('does not count right passwords', async () => {
      for (let i = 0; i < 60; i++) expect(await login(PASSWORD)).toBe(200);
    });

    it('lets at most 5 concurrent guesses through', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => login(WRONG)),
      );
      expect(results.filter((s) => s === 401)).toHaveLength(5);
      expect(results.filter((s) => s === 429)).toHaveLength(15);
    });

    it('does not count an attempt that failed because of an outage', async () => {
      storedHash = undefined; // bcrypt.compare rejects
      for (let i = 0; i < 6; i++) expect(await login(PASSWORD)).toBe(500);
      storedHash = hash;
      expect(await login(PASSWORD)).toBe(200);
    });

    it('stores neither the username nor the address in clear', async () => {
      await fail(1);
      const keys = [...store.counters.keys()].join(' ');
      expect(keys).toMatch(/^attempts:login:/);
      expect(keys).not.toContain('alice');
      expect(keys).not.toContain('203.0.113.1');
    });
  });

  describe('two-step login', () => {
    beforeEach(() => twoFactor.isEnabled.mockResolvedValue(true));

    it('keeps the wrong passwords counted until the code is right', async () => {
      await fail(4);
      expect(await login(PASSWORD)).toBe(200); // challenge only
      await fail(1);
      expect(await login(PASSWORD)).toBe(429);
    });

    it('starts again from 0 after the code', async () => {
      await fail(4);
      expect(
        await statusOf(
          service.completeTwoFactorLogin(
            'c'.repeat(64),
            '123456',
            'agent',
            '203.0.113.1',
          ),
        ),
      ).toBe(200);
      await fail(4);
      expect(await login(PASSWORD)).toBe(200);
    });
  });

  describe('change password', () => {
    const change = (currentPassword: string, code?: string) =>
      service.changePassword(id, {
        currentPassword,
        newPassword: 'brand-new-1',
        code,
      });

    it('refuses after 5 wrong current passwords, without affecting sign-in', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(change(WRONG)).rejects.toThrow(BadRequestException);
      }
      expect(await statusOf(change(PASSWORD))).toBe(429);
      expect(usersService.setPasswordHash).not.toHaveBeenCalled();
      expect(await login(PASSWORD)).toBe(200);
    });

    it('refuses after 5 wrong codes; a missing code is not counted', async () => {
      twoFactor.isEnabled.mockResolvedValue(true);
      twoFactor.verifyCode.mockResolvedValue(false);
      for (let i = 0; i < 7; i++) {
        expect(await statusOf(change(PASSWORD))).toBe(400);
      }
      for (let i = 0; i < 5; i++) {
        expect(await statusOf(change(PASSWORD, '000000'))).toBe(400);
      }
      twoFactor.verifyCode.mockClear();
      expect(await statusOf(change(PASSWORD, '123456'))).toBe(429);
      expect(twoFactor.verifyCode).not.toHaveBeenCalled();
    });

    it('is not blocked by wrong codes typed at sign-in', async () => {
      // Someone who knows the password must not stop the owner from changing it
      twoFactor.isEnabled.mockResolvedValue(true);
      twoFactor.verifyCode.mockResolvedValue(true);
      for (let i = 0; i < 5; i++) {
        await limits.check([limits.loginCode(id)], () =>
          Promise.resolve(false),
        );
      }
      expect(await statusOf(change(PASSWORD, '123456'))).toBe(200);
    });
  });

  it('keeps the 401 message of a wrong password unchanged', async () => {
    await expect(
      service.login({ username: 'alice', password: WRONG }),
    ).rejects.toThrow(
      new UnauthorizedException('Username hoặc mật khẩu không chính xác'),
    );
  });
});
