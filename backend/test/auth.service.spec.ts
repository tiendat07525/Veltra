import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SessionService } from '../src/auth/session.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService (Security & Registration)', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    signAsync: jest.fn().mockResolvedValue('mock-new-access-token'),
  };

  const mockSessionService = {
    createSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
    revokeSession: jest.fn(),
    getSession: jest.fn(),
    rotateSessionToken: jest.fn(),
  };

  const mockRealtimeService = {
    disconnectUser: jest.fn(),
    disconnectSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
        {
          provide: RealtimeService,
          useValue: mockRealtimeService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('FULLAUDIT-001 Remediation: Registration Flow & Password Hashing', () => {
    const registerDto = {
      username: 'testalice',
      email: 'alice@example.com',
      password: 'StrongSecretPassword123!',
    };

    it('should reject registration if email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ _id: 'existing1' });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Email đã tồn tại'),
      );
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
        registerDto.email,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should reject registration if username already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue({ _id: 'existing2' });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Username đã tồn tại'),
      );
      expect(mockUsersService.findByUsername).toHaveBeenCalledWith(
        registerDto.username,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should hash password with bcrypt (10 rounds) and invoke usersService.create without returning password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(null);
      mockUsersService.create.mockImplementation(
        (dto: { username: string; email: string; password: string }) => {
          return Promise.resolve({
            message: 'Tạo user thành công',
            data: {
              _id: 'newUserId',
              username: dto.username,
              email: dto.email,
            },
          });
        },
      );

      const result = await service.register(registerDto);

      expect(mockUsersService.create).toHaveBeenCalled();
      const createArg = mockUsersService.create.mock.calls[0][0] as {
        password: string;
      };

      // Password must NOT be plaintext
      expect(createArg.password).not.toEqual(registerDto.password);
      // Password must be a valid bcrypt hash
      expect(createArg.password.startsWith('$2b$10$')).toBe(true);

      const isValidBcrypt = await bcrypt.compare(
        registerDto.password,
        createArg.password,
      );
      expect(isValidBcrypt).toBe(true);

      // Password must never be returned in the response
      const dataRecord = result.data as Record<string, unknown>;
      expect(dataRecord.password).toBeUndefined();
      const resultRecord = result as unknown as Record<string, unknown>;
      expect(resultRecord.password).toBeUndefined();
    });
  });

  describe('Authentication Generic Error Messages', () => {
    it('should return generic error message when user not found', async () => {
      mockUsersService.findByUsername.mockResolvedValue(null);

      await expect(
        service.login({ username: 'nonexistent', password: 'password' }),
      ).rejects.toThrow(
        new UnauthorizedException('Username hoặc mật khẩu không chính xác'),
      );
    });

    it('should return identical generic error message when password incorrect', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);
      mockUsersService.findByUsername.mockResolvedValue({
        _id: 'user1',
        username: 'user1',
        password: hashedPassword,
      });

      await expect(
        service.login({ username: 'user1', password: 'wrongPassword' }),
      ).rejects.toThrow(
        new UnauthorizedException('Username hoặc mật khẩu không chính xác'),
      );
    });
  });

  describe('Refresh Token Security & Rotation (P1.2)', () => {
    it('should reject refresh when refresh token is empty or missing', async () => {
      await expect(service.refresh('')).rejects.toThrow(
        new UnauthorizedException('Token không hợp lệ'),
      );
    });

    it('should reject refresh when refresh token format is invalid (not 3 parts)', async () => {
      await expect(service.refresh('invalid-token')).rejects.toThrow(
        new UnauthorizedException('Token không hợp lệ'),
      );
      await expect(service.refresh('part1.part2')).rejects.toThrow(
        new UnauthorizedException('Token không hợp lệ'),
      );
    });

    it('should reject refresh when session does not exist in Redis (revoked/expired)', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(service.refresh('user1.sess1.rawTokenHex')).rejects.toThrow(
        new UnauthorizedException(
          'Phiên đăng nhập không tồn tại hoặc đã hết hạn',
        ),
      );
    });

    it('should successfully rotate refresh token and issue new access token on valid refresh', async () => {
      const rawToken = 'mySecretRawTokenHexValue123456';
      const tokenHash = await bcrypt.hash(rawToken, 10);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: tokenHash,
      });
      mockSessionService.rotateSessionToken.mockResolvedValue(true);
      mockUsersService.findOne.mockResolvedValue({
        _id: 'user1',
        email: 'user1@example.com',
        username: 'alice',
      });

      const result = await service.refresh(`user1.sess1.${rawToken}`);

      expect(result.accessToken).toBe('mock-new-access-token');
      expect(result.refreshTokenString).toBeDefined();
      expect(result.refreshTokenString.startsWith('user1.sess1.')).toBe(true);
      expect(mockSessionService.rotateSessionToken).toHaveBeenCalled();
    });

    it('should allow concurrent refresh within 15s grace period with previousRefreshTokenHash', async () => {
      const oldRawToken = 'oldTokenHexValue1234567890';
      const oldHash = await bcrypt.hash(oldRawToken, 10);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: 'newHashAlreadyRotated',
        previousRefreshTokenHash: oldHash,
        rotatedAt: new Date().toISOString(), // within 15s grace window
      });
      mockSessionService.rotateSessionToken.mockResolvedValue(true);
      mockUsersService.findOne.mockResolvedValue({
        _id: 'user1',
        email: 'user1@example.com',
        username: 'alice',
      });

      const result = await service.refresh(`user1.sess1.${oldRawToken}`);

      expect(result.accessToken).toBe('mock-new-access-token');
      expect(result.refreshTokenString).toBeDefined();
    });

    it('should detect token theft and revoke all user sessions when token matches neither current nor previous', async () => {
      const currentHash = await bcrypt.hash('legitCurrent', 10);
      const prevHash = await bcrypt.hash('legitPrevious', 10);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: currentHash,
        previousRefreshTokenHash: prevHash,
        rotatedAt: new Date().toISOString(),
      });

      await expect(
        service.refresh('user1.sess1.attackerForgedToken'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Phát hiện đánh cắp token, tất cả phiên bị hủy',
        ),
      );
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'user1',
      );
    });

    it('should throw UnauthorizedException on rotation concurrency conflict', async () => {
      const rawToken = 'myToken';
      const tokenHash = await bcrypt.hash(rawToken, 10);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: tokenHash,
      });
      mockSessionService.rotateSessionToken.mockResolvedValue(false); // Lua script returned 0 (conflict)

      await expect(service.refresh(`user1.sess1.${rawToken}`)).rejects.toThrow(
        new UnauthorizedException('Xung đột refresh token'),
      );
    });
  });

  describe('FULLAUDIT-006 Remediation: High-Entropy Refresh Token SHA-256 Storage & Legacy Migration', () => {
    it('should store SHA-256 digest (64 hex characters) and never raw token on login', async () => {
      const password = 'StrongPassword123!';
      const hashedPassword = await bcrypt.hash(password, 10);

      mockUsersService.findByUsername.mockResolvedValue({
        _id: 'user1',
        username: 'alice',
        password: hashedPassword,
        email: 'alice@example.com',
      });
      mockSessionService.createSession.mockResolvedValue(undefined);

      const loginResult = await service.login(
        { username: 'alice', password },
        'Firefox / Linux',
        '127.0.0.1',
      );

      expect(loginResult.refreshTokenString).toBeDefined();
      const parts = loginResult.refreshTokenString.split('.');
      expect(parts.length).toBe(3);
      const [userId, sessionId, rawToken] = parts;

      expect(mockSessionService.createSession).toHaveBeenCalled();
      const createSessionCall = mockSessionService.createSession.mock.calls[0];
      const sessionData = createSessionCall[2];

      // Stored hash must be SHA-256 (64 hex characters), not bcrypt ($2b$ or $2a$)
      expect(sessionData.refreshTokenHash).toHaveLength(64);
      expect(sessionData.refreshTokenHash.startsWith('$2')).toBe(false);
      expect(/^[0-9a-f]{64}$/.test(sessionData.refreshTokenHash)).toBe(true);

      // Verify raw token is NEVER persisted in the session store
      expect(sessionData.refreshTokenHash).not.toBe(rawToken);
      expect(JSON.stringify(sessionData)).not.toContain(rawToken);

      // Verify that hashing the raw token with sha256 matches the stored digest
      const expectedDigest = service.hashRefreshToken(rawToken);
      expect(sessionData.refreshTokenHash).toBe(expectedDigest);
    });

    it('should authenticate and rotate valid SHA-256 refresh tokens using constant-time comparison', async () => {
      const rawToken = 'randomHighEntropyTokenValueHex1234567890abcdef';
      const sha256Hash = service.hashRefreshToken(rawToken);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: sha256Hash,
      });
      mockSessionService.rotateSessionToken.mockResolvedValue(true);
      mockUsersService.findOne.mockResolvedValue({
        _id: 'user1',
        email: 'user1@example.com',
        username: 'alice',
      });

      const result = await service.refresh(`user1.sess1.${rawToken}`);

      expect(result.accessToken).toBe('mock-new-access-token');
      expect(result.refreshTokenString).toBeDefined();

      // Check rotated token arguments
      expect(mockSessionService.rotateSessionToken).toHaveBeenCalled();
      const rotateArgs = mockSessionService.rotateSessionToken.mock.calls[0];
      const [calledUserId, calledSessionId, oldHash, newHash] = rotateArgs;

      expect(calledUserId).toBe('user1');
      expect(calledSessionId).toBe('sess1');
      expect(oldHash).toBe(sha256Hash);
      expect(newHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(newHash)).toBe(true);
      expect(newHash.startsWith('$2')).toBe(false);
    });

    it('should seamlessly authenticate legacy bcrypt-hashed refresh token and rotate to SHA-256 (Migration Strategy)', async () => {
      const rawToken = 'legacyTokenHeldByActiveUserBeforeMigration';
      const legacyBcryptHash = await bcrypt.hash(rawToken, 10);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: legacyBcryptHash,
      });
      mockSessionService.rotateSessionToken.mockResolvedValue(true);
      mockUsersService.findOne.mockResolvedValue({
        _id: 'user1',
        email: 'user1@example.com',
        username: 'alice',
      });

      const result = await service.refresh(`user1.sess1.${rawToken}`);

      expect(result.accessToken).toBe('mock-new-access-token');
      expect(result.refreshTokenString).toBeDefined();

      // The rotation should match the old bcrypt hash and save a new SHA-256 hash!
      const rotateArgs = mockSessionService.rotateSessionToken.mock.calls[0];
      const [, , oldHashPassedToLua, newHashPassedToLua] = rotateArgs;

      expect(oldHashPassedToLua).toBe(legacyBcryptHash);
      expect(newHashPassedToLua).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(newHashPassedToLua)).toBe(true);
    });

    it('should reject invalid SHA-256 token and detect theft', async () => {
      const legitimateToken = 'legitimateTokenSecret123456';
      const legitimateHash = service.hashRefreshToken(legitimateToken);

      mockSessionService.getSession.mockResolvedValue({
        userId: 'user1',
        sessionId: 'sess1',
        refreshTokenHash: legitimateHash,
      });

      await expect(
        service.refresh('user1.sess1.attackerForgedRawToken'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Phát hiện đánh cắp token, tất cả phiên bị hủy',
        ),
      );
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'user1',
      );
    });
  });

  describe('Session Lifecycle & Single-Active Policy Enforcement (P1.2)', () => {
    it('should invalidate all previous sessions and disconnect sockets when user logs in on new device', async () => {
      const password = 'StrongPassword123!';
      const hashedPassword = await bcrypt.hash(password, 10);

      mockUsersService.findByUsername.mockResolvedValue({
        _id: 'user1',
        username: 'alice',
        password: hashedPassword,
        email: 'alice@example.com',
      });
      mockSessionService.createSession.mockResolvedValue(undefined);

      await service.login(
        { username: 'alice', password },
        'Chrome / Mac',
        '1.2.3.4',
      );

      // Crucial: Single-device policy mandates revoking all previous sessions and dropping sockets
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'user1',
      );
      expect(mockRealtimeService.disconnectUser).toHaveBeenCalledWith('user1');
      expect(mockSessionService.createSession).toHaveBeenCalled();
    });

    it('should revoke user session in Redis on logout', async () => {
      mockSessionService.revokeSession.mockResolvedValue(undefined);

      await service.logout('user1', 'sess1');

      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(
        'user1',
        'sess1',
      );
    });
  });
});
