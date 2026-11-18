import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { generateSync } from 'otplib';
import { TwoFactorCryptoService } from '../src/auth/two-factor/two-factor-crypto.service';
import {
  BACKUP_CODE_COUNT,
  PENDING_SETUP_TTL_MS,
  TwoFactorService,
} from '../src/auth/two-factor/two-factor.service';
import { SessionService } from '../src/auth/session.service';
import { UserDocument } from '../src/users/schemas/user.schema';
import { Model } from 'mongoose';
import {
  LoginTwoFactorDto,
  TwoFactorPasswordCodeDto,
} from '../src/auth/two-factor/dto/two-factor.dto';
import { FakeUserModel } from './helpers/fake-user-model';

const KEY = crypto.randomBytes(32).toString('hex');
const PASSWORD = 'pass-1234';

const cryptoWith = (key: string | undefined) =>
  new TwoFactorCryptoService({
    get: () => key,
  } as unknown as ConfigService);

// TOTP code for "now + offset seconds"
const totp = (secret: string, offsetSeconds = 0) =>
  generateSync({
    secret,
    epoch: Math.floor(Date.now() / 1000) + offsetSeconds,
  });

describe('TwoFactorCryptoService', () => {
  const userId = new Types.ObjectId().toString();

  it('round-trips and never stores the plain secret', () => {
    const service = cryptoWith(KEY);
    const stored = service.encrypt('JBSWY3DPEHPK3PXP', userId);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(service.decrypt(stored, userId)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('a ciphertext of another user, a modified one or another key does not decrypt', () => {
    const service = cryptoWith(KEY);
    const stored = service.encrypt('SECRET', userId);
    expect(() =>
      service.decrypt(stored, new Types.ObjectId().toString()),
    ).toThrow();
    const [v, iv, tag, ct] = stored.split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    expect(() =>
      service.decrypt(
        [v, iv, tag, flipped.toString('base64')].join(':'),
        userId,
      ),
    ).toThrow();
    expect(() =>
      cryptoWith(crypto.randomBytes(32).toString('hex')).decrypt(
        stored,
        userId,
      ),
    ).toThrow();
  });

  it.each([undefined, 'short', 'z'.repeat(64)])(
    'key %p → 503 on use',
    (key) => {
      const service = cryptoWith(key);
      expect(() => service.encrypt('x', userId)).toThrow(
        ServiceUnavailableException,
      );
    },
  );
});

describe('TwoFactorService', () => {
  let model: FakeUserModel;
  let service: TwoFactorService;
  let cryptoService: TwoFactorCryptoService;
  let passwordHash: string;
  const challenges = new Map<string, { userId: string; attempts: number }>();
  const sessionService = {
    createTwoFactorChallenge: jest.fn(
      (hash: string, userId: string, _ttlSeconds: number) => {
        challenges.set(hash, { userId, attempts: 0 });
        return Promise.resolve();
      },
    ),
    getTwoFactorChallengeUserId: jest.fn((hash: string) =>
      Promise.resolve(challenges.get(hash)?.userId ?? null),
    ),
    recordTwoFactorChallengeFailure: jest.fn((hash: string) => {
      const c = challenges.get(hash);
      if (!c) return Promise.resolve(0);
      c.attempts += 1;
      return Promise.resolve(c.attempts);
    }),
    deleteTwoFactorChallenge: jest.fn((hash: string) =>
      Promise.resolve(challenges.delete(hash)),
    ),
  };

  const userId = new Types.ObjectId();
  const id = userId.toString();

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    challenges.clear();
    jest.clearAllMocks();
    model = new FakeUserModel();
    model.add({ _id: userId, username: 'alice', password: passwordHash });
    cryptoService = cryptoWith(KEY);
    service = new TwoFactorService(
      model as unknown as Model<UserDocument>,
      cryptoService,
      sessionService as unknown as SessionService,
    );
  });

  // setup + enable with a valid code; returns the secret and the backup codes
  const enableTwoFactor = async () => {
    const { secret } = await service.setup(id, PASSWORD);
    const { backupCodes } = await service.enable(id, totp(secret));
    return { secret, backupCodes };
  };

  // A code from the next time step (the one used by enable is already spent)
  const nextCode = (secret: string) => totp(secret, 30);

  describe('setup', () => {
    it('wrong password → 400, nothing stored', async () => {
      await expect(service.setup(id, 'wrong')).rejects.toThrow(
        new BadRequestException('Mật khẩu hiện tại không đúng'),
      );
      expect(model.get(userId)?.twoFactor).toBeUndefined();
    });

    it('returns the secret + otpauth link and stores it only encrypted, still disabled', async () => {
      const { secret, otpauthUrl } = await service.setup(id, PASSWORD);

      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(otpauthUrl).toContain('issuer=Veltra');
      expect(otpauthUrl).toContain(`secret=${secret}`);
      expect(otpauthUrl).toContain('alice');

      const stored = model.get(userId)?.twoFactor as Record<string, unknown>;
      expect(stored.enabled).toBeFalsy();
      expect(JSON.stringify(stored)).not.toContain(secret);
      expect(cryptoService.decrypt(stored.pendingSecret as string, id)).toBe(
        secret,
      );
      await expect(service.isEnabled(id)).resolves.toBe(false);
    });

    it('already enabled → 400', async () => {
      await enableTwoFactor();
      await expect(service.setup(id, PASSWORD)).rejects.toThrow(
        new BadRequestException('Xác thực 2 bước đang bật'),
      );
    });

    it('no encryption key → 503', async () => {
      service = new TwoFactorService(
        model as unknown as Model<UserDocument>,
        cryptoWith(undefined),
        sessionService as unknown as SessionService,
      );
      await expect(service.setup(id, PASSWORD)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('enable', () => {
    it('without setup → 400', async () => {
      await expect(service.enable(id, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('wrong code → 400, still disabled', async () => {
      const { secret } = await service.setup(id, PASSWORD);
      const wrong = totp(secret) === '000000' ? '111111' : '000000';
      await expect(service.enable(id, wrong)).rejects.toThrow(
        new BadRequestException('Mã xác thực không đúng'),
      );
      await expect(service.isEnabled(id)).resolves.toBe(false);
    });

    it('setup older than 10 minutes → 400', async () => {
      const { secret } = await service.setup(id, PASSWORD);
      (
        model.get(userId)?.twoFactor as Record<string, unknown>
      ).pendingCreatedAt = new Date(Date.now() - PENDING_SETUP_TTL_MS - 1000);
      await expect(service.enable(id, totp(secret))).rejects.toThrow(
        new BadRequestException('Phiên thiết lập đã hết hạn, hãy bắt đầu lại'),
      );
    });

    it('right code → enabled, 10 backup codes shown once and stored hashed, pending cleared', async () => {
      const { backupCodes } = await enableTwoFactor();

      expect(backupCodes).toHaveLength(BACKUP_CODE_COUNT);
      expect(new Set(backupCodes).size).toBe(BACKUP_CODE_COUNT);
      backupCodes.forEach((c) =>
        expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/),
      );

      const stored = model.get(userId)?.twoFactor as Record<string, unknown>;
      expect(stored.enabled).toBe(true);
      expect(stored.enabledAt).toBeInstanceOf(Date);
      expect(stored.pendingSecret).toBeUndefined();
      expect(stored.backupCodes).toHaveLength(BACKUP_CODE_COUNT);
      for (const code of backupCodes) {
        expect(JSON.stringify(stored)).not.toContain(code.replace('-', ''));
      }
      await expect(service.status(id)).resolves.toEqual({
        enabled: true,
        enabledAt: stored.enabledAt,
        backupCodesRemaining: BACKUP_CODE_COUNT,
      });
    });

    it('the code that enabled 2FA cannot be used again', async () => {
      const { secret } = await service.setup(id, PASSWORD);
      const code = totp(secret);
      await service.enable(id, code);
      await expect(service.verifyCode(id, code)).resolves.toBe(false);
    });
  });

  describe('verifyCode', () => {
    it('accepts a TOTP code once (replay → false)', async () => {
      const { secret } = await enableTwoFactor();
      const code = nextCode(secret);
      await expect(service.verifyCode(id, code)).resolves.toBe(true);
      await expect(service.verifyCode(id, code)).resolves.toBe(false);
    });

    it('two concurrent requests with the same code → only one passes', async () => {
      const { secret } = await enableTwoFactor();
      const code = nextCode(secret);
      const results = await Promise.all([
        service.verifyCode(id, code),
        service.verifyCode(id, code),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('rejects a code two steps away', async () => {
      const { secret } = await enableTwoFactor();
      await expect(service.verifyCode(id, totp(secret, 90))).resolves.toBe(
        false,
      );
    });

    it('accepts each backup code once, in any case / spacing', async () => {
      const { backupCodes } = await enableTwoFactor();
      const [first, second] = backupCodes;

      await expect(service.verifyCode(id, first)).resolves.toBe(true);
      await expect(service.verifyCode(id, first)).resolves.toBe(false);
      await expect(
        service.verifyCode(id, ` ${second.toUpperCase().replace('-', ' ')} `),
      ).resolves.toBe(true);
      await expect(service.status(id)).resolves.toMatchObject({
        backupCodesRemaining: BACKUP_CODE_COUNT - 2,
      });
    });

    it('backup codes are refused where only TOTP is allowed', async () => {
      const { backupCodes } = await enableTwoFactor();
      await expect(
        service.verifyCode(id, backupCodes[0], ['totp']),
      ).resolves.toBe(false);
    });

    it.each(['', '12345', '1234567', 'abcde-fghij', 'not a code'])(
      'returns false for %p',
      async (code) => {
        await enableTwoFactor();
        await expect(service.verifyCode(id, code)).resolves.toBe(false);
      },
    );

    it('returns false when 2FA is off', async () => {
      await expect(service.verifyCode(id, '123456')).resolves.toBe(false);
    });
  });

  describe('disable', () => {
    it('wrong password → 400, still enabled, no code used', async () => {
      const { backupCodes } = await enableTwoFactor();
      await expect(
        service.disable(id, 'wrong', backupCodes[0]),
      ).rejects.toThrow(BadRequestException);
      await expect(service.status(id)).resolves.toMatchObject({
        enabled: true,
        backupCodesRemaining: BACKUP_CODE_COUNT,
      });
    });

    it('wrong code → 400, still enabled', async () => {
      await enableTwoFactor();
      await expect(
        service.disable(id, PASSWORD, 'aaaaa-aaaaa'),
      ).rejects.toThrow(new BadRequestException('Mã xác thực không đúng'));
      await expect(service.isEnabled(id)).resolves.toBe(true);
    });

    it('with a TOTP code → the whole twoFactor field is removed', async () => {
      const { secret } = await enableTwoFactor();
      await service.disable(id, PASSWORD, nextCode(secret));
      expect(model.get(userId)?.twoFactor).toBeUndefined();
      await expect(service.status(id)).resolves.toEqual({
        enabled: false,
        enabledAt: null,
        backupCodesRemaining: 0,
      });
    });

    it('with a backup code → disabled', async () => {
      const { backupCodes } = await enableTwoFactor();
      await service.disable(id, PASSWORD, backupCodes[3]);
      await expect(service.isEnabled(id)).resolves.toBe(false);
    });

    it('when not enabled → 400', async () => {
      await expect(service.disable(id, PASSWORD, '123456')).rejects.toThrow(
        new BadRequestException('Xác thực 2 bước chưa bật'),
      );
    });
  });

  describe('regenerateBackupCodes', () => {
    it('needs a TOTP code; a backup code → 400', async () => {
      const { backupCodes } = await enableTwoFactor();
      await expect(
        service.regenerateBackupCodes(id, PASSWORD, backupCodes[0]),
      ).rejects.toThrow(new BadRequestException('Mã xác thực không đúng'));
    });

    it('replaces every code: old ones stop working, new ones work', async () => {
      const { secret, backupCodes: oldCodes } = await enableTwoFactor();
      const { backupCodes: newCodes } = await service.regenerateBackupCodes(
        id,
        PASSWORD,
        nextCode(secret),
      );
      expect(newCodes).toHaveLength(BACKUP_CODE_COUNT);
      expect(newCodes.some((c) => oldCodes.includes(c))).toBe(false);
      await expect(service.verifyCode(id, oldCodes[0])).resolves.toBe(false);
      await expect(service.verifyCode(id, newCodes[0])).resolves.toBe(true);
    });
  });

  describe('login challenge', () => {
    it('stores only a hash of the token, for 5 minutes', async () => {
      await enableTwoFactor();
      const token = await service.createLoginChallenge(id);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const [hash, storedUserId, ttl] =
        sessionService.createTwoFactorChallenge.mock.calls[0];
      expect(hash).not.toBe(token);
      expect(hash).toBe(
        crypto.createHash('sha256').update(token).digest('hex'),
      );
      expect(storedUserId).toBe(id);
      expect(ttl).toBe(300);
    });

    it('right code → user id, and the challenge cannot be used again', async () => {
      const { secret } = await enableTwoFactor();
      const token = await service.createLoginChallenge(id);
      await expect(
        service.completeLoginChallenge(token, nextCode(secret)),
      ).resolves.toBe(id);
      expect(challenges.size).toBe(0);
      await expect(
        service.completeLoginChallenge(token, totp(secret, 60)),
      ).rejects.toThrow('Phiên xác thực đã hết hạn, hãy đăng nhập lại');
    });

    it('accepts a backup code', async () => {
      const { backupCodes } = await enableTwoFactor();
      const token = await service.createLoginChallenge(id);
      await expect(
        service.completeLoginChallenge(token, backupCodes[0]),
      ).resolves.toBe(id);
    });

    it('wrong code → 401; the 5th failure deletes the challenge', async () => {
      const { secret } = await enableTwoFactor();
      const token = await service.createLoginChallenge(id);
      for (let i = 0; i < 4; i++) {
        await expect(
          service.completeLoginChallenge(token, 'aaaaa-aaaaa'),
        ).rejects.toThrow('Mã xác thực không đúng');
      }
      await expect(
        service.completeLoginChallenge(token, 'aaaaa-aaaaa'),
      ).rejects.toThrow('Nhập sai quá nhiều lần, hãy đăng nhập lại');
      expect(challenges.size).toBe(0);
      // Even the right code is refused now
      await expect(
        service.completeLoginChallenge(token, nextCode(secret)),
      ).rejects.toThrow('Phiên xác thực đã hết hạn, hãy đăng nhập lại');
    });

    it.each(['', 'x', 'g'.repeat(64)])(
      'malformed token %p → 401 without touching Redis',
      async (token) => {
        await expect(
          service.completeLoginChallenge(token, '123456'),
        ).rejects.toThrow('Phiên xác thực đã hết hạn, hãy đăng nhập lại');
        expect(
          sessionService.getTwoFactorChallengeUserId,
        ).not.toHaveBeenCalled();
      },
    );

    it('only one of two concurrent completions succeeds', async () => {
      const { backupCodes } = await enableTwoFactor();
      const token = await service.createLoginChallenge(id);
      const results = await Promise.allSettled([
        service.completeLoginChallenge(token, backupCodes[0]),
        service.completeLoginChallenge(token, backupCodes[1]),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });
});

describe('2FA DTOs', () => {
  const errorsFor = <T extends object>(cls: new () => T, body: unknown) =>
    validate(plainToInstance(cls, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('LoginTwoFactorDto accepts a token + code and rejects extras / non-strings', async () => {
    expect(
      await errorsFor(LoginTwoFactorDto, {
        challengeToken: 'a'.repeat(64),
        code: '123456',
      }),
    ).toHaveLength(0);
    expect(
      (
        await errorsFor(LoginTwoFactorDto, {
          challengeToken: 'a'.repeat(64),
          code: 123456,
        })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await errorsFor(LoginTwoFactorDto, {
          challengeToken: 'a'.repeat(64),
          code: '123456',
          userId: 'x',
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('TwoFactorPasswordCodeDto needs both fields', async () => {
    expect(
      (await errorsFor(TwoFactorPasswordCodeDto, { code: '123456' })).length,
    ).toBeGreaterThan(0);
    expect(
      await errorsFor(TwoFactorPasswordCodeDto, {
        currentPassword: 'x',
        code: '123456',
      }),
    ).toHaveLength(0);
  });
});
