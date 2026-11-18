import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { SessionService } from '../src/auth/session.service';
import { UsersService } from '../src/users/users.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { TwoFactorService } from '../src/auth/two-factor/two-factor.service';
import { TwoFactorController } from '../src/auth/two-factor/two-factor.controller';

describe('AuthService two-step login', () => {
  let service: AuthService;
  const userId = new Types.ObjectId();
  const id = userId.toString();
  const PASSWORD = 'pass-1234';
  let user: Record<string, unknown>;

  const mockUsersService = {
    findByUsernameWithPassword: jest.fn(),
    findByIdWithPassword: jest.fn(),
  };
  const mockSessionService = {
    createSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
  };
  const mockRealtimeService = { disconnectUser: jest.fn() };
  const mockJwtService = { signAsync: jest.fn().mockResolvedValue('access') };
  const mockTwoFactorService = {
    isEnabled: jest.fn(),
    createLoginChallenge: jest.fn(),
    completeLoginChallenge: jest.fn(),
  };

  beforeAll(async () => {
    user = {
      _id: userId,
      username: 'alice',
      email: 'alice@example.test',
      password: await bcrypt.hash(PASSWORD, 4),
    };
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: TwoFactorService, useValue: mockTwoFactorService },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
    mockUsersService.findByUsernameWithPassword.mockResolvedValue(user);
    mockUsersService.findByIdWithPassword.mockResolvedValue(user);
    mockTwoFactorService.isEnabled.mockResolvedValue(true);
    mockTwoFactorService.createLoginChallenge.mockResolvedValue('c'.repeat(64));
  });

  const expectNoSession = () => {
    expect(mockSessionService.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(mockRealtimeService.disconnectUser).not.toHaveBeenCalled();
    expect(mockSessionService.createSession).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  };

  it('right password + 2FA on → challenge only: no token, no session, other devices stay signed in', async () => {
    const result = await service.login({
      username: 'alice',
      password: PASSWORD,
    });

    expect(result).toEqual({
      message: 'Cần mã xác thực 2 bước',
      twoFactorRequired: true,
      challengeToken: 'c'.repeat(64),
    });
    expect(mockTwoFactorService.createLoginChallenge).toHaveBeenCalledWith(id);
    expectNoSession();
  });

  it('wrong password + 2FA on → 401 and no challenge (2FA state not revealed)', async () => {
    await expect(
      service.login({ username: 'alice', password: 'wrong-pass' }),
    ).rejects.toThrow(
      new UnauthorizedException('Username hoặc mật khẩu không chính xác'),
    );
    expect(mockTwoFactorService.isEnabled).not.toHaveBeenCalled();
    expect(mockTwoFactorService.createLoginChallenge).not.toHaveBeenCalled();
  });

  it('2FA off → session as before', async () => {
    mockTwoFactorService.isEnabled.mockResolvedValue(false);
    const result = await service.login({
      username: 'alice',
      password: PASSWORD,
    });
    expect(result).toMatchObject({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
    });
    expect(mockSessionService.createSession).toHaveBeenCalled();
    expect(mockTwoFactorService.createLoginChallenge).not.toHaveBeenCalled();
  });

  it('completeTwoFactorLogin: right code → single session for the user from the challenge', async () => {
    mockTwoFactorService.completeLoginChallenge.mockResolvedValue(id);

    const result = await service.completeTwoFactorLogin(
      'c'.repeat(64),
      '123456',
      'agent',
      '1.2.3.4',
    );

    expect(mockTwoFactorService.completeLoginChallenge).toHaveBeenCalledWith(
      'c'.repeat(64),
      '123456',
    );
    expect(mockUsersService.findByIdWithPassword).toHaveBeenCalledWith(id);
    expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(id);
    expect(mockRealtimeService.disconnectUser).toHaveBeenCalledWith(id);
    const [sessionUserId, , data] = mockSessionService.createSession.mock
      .calls[0] as [string, string, { userAgent?: string }];
    expect(sessionUserId).toBe(id);
    expect(data.userAgent).toBe('agent');
    expect(result).toMatchObject({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
      refreshTokenString: expect.stringMatching(new RegExp(`^${id}\\.`)),
    });
  });

  it('completeTwoFactorLogin: wrong code → the 401 passes through, no session', async () => {
    mockTwoFactorService.completeLoginChallenge.mockRejectedValue(
      new UnauthorizedException('Mã xác thực không đúng'),
    );
    await expect(
      service.completeTwoFactorLogin('c'.repeat(64), '000000'),
    ).rejects.toThrow(new UnauthorizedException('Mã xác thực không đúng'));
    expectNoSession();
  });

  it('completeTwoFactorLogin: user deleted meanwhile → 401, no session', async () => {
    mockTwoFactorService.completeLoginChallenge.mockResolvedValue(id);
    mockUsersService.findByIdWithPassword.mockResolvedValue(null);
    await expect(
      service.completeTwoFactorLogin('c'.repeat(64), '123456'),
    ).rejects.toThrow(UnauthorizedException);
    expectNoSession();
  });
});

describe('AuthController two-step login', () => {
  let controller: AuthController;
  const mockAuthService = {
    login: jest.fn(),
    completeTwoFactorLogin: jest.fn(),
  };
  const req = {
    headers: { 'user-agent': 'agent' },
    ip: '1.2.3.4',
  } as unknown as Request;
  let res: { cookie: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();
    controller = module.get(AuthController);
    jest.clearAllMocks();
    res = { cookie: jest.fn() };
  });

  it('login with 2FA on → returns the challenge, sets no cookie', async () => {
    const challenge = {
      message: 'Cần mã xác thực 2 bước',
      twoFactorRequired: true as const,
      challengeToken: 'c'.repeat(64),
    };
    mockAuthService.login.mockResolvedValue(challenge);

    const result = await controller.login(
      { username: 'alice', password: 'pass-1234' },
      req,
      res as unknown as Response,
    );

    expect(result).toEqual(challenge);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('login with 2FA off → access token + refresh cookie as before', async () => {
    mockAuthService.login.mockResolvedValue({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
      refreshTokenString: 'refresh',
    });

    const result = await controller.login(
      { username: 'alice', password: 'pass-1234' },
      req,
      res as unknown as Response,
    );

    expect(result).toEqual({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('POST /auth/login/2fa → access token + HttpOnly refresh cookie, token not in the body', async () => {
    mockAuthService.completeTwoFactorLogin.mockResolvedValue({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
      refreshTokenString: 'refresh',
    });

    const result = await controller.loginTwoFactor(
      { challengeToken: 'c'.repeat(64), code: '123456' },
      req,
      res as unknown as Response,
    );

    expect(mockAuthService.completeTwoFactorLogin).toHaveBeenCalledWith(
      'c'.repeat(64),
      '123456',
      'agent',
      '1.2.3.4',
    );
    expect(result).toEqual({
      message: 'Đăng nhập thành công',
      accessToken: 'access',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  const throttleOf = (handler: unknown) => ({
    ttl: Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      handler as object,
    ) as number,
    limit: Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      handler as object,
    ) as number,
  });

  it('login/2fa and every 2FA change are limited to 5 per minute', () => {
    for (const handler of [
      /* eslint-disable @typescript-eslint/unbound-method */
      AuthController.prototype.loginTwoFactor,
      TwoFactorController.prototype.setup,
      TwoFactorController.prototype.enable,
      TwoFactorController.prototype.disable,
      TwoFactorController.prototype.regenerateBackupCodes,
      /* eslint-enable @typescript-eslint/unbound-method */
    ]) {
      expect(throttleOf(handler)).toEqual({ ttl: 60000, limit: 5 });
    }
  });
});
