import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy, JwtPayload } from '../src/auth/jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { SessionService } from '../src/auth/session.service';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy (Token Validation & Session Revocation - FULLAUDIT-005)', () => {
  let strategy: JwtStrategy;

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockSessionService = {
    getSession: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('test-256-bit-secret-key-for-jwt-testing-12345'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('JWT Payload & Session Verification', () => {
    const activeSession = {
      userId: 'user123',
      sessionId: 'sess_abc123',
      refreshTokenHash: 'mockHash',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const mockUser = {
      _id: 'user123',
      email: 'user@example.com',
      username: 'validuser',
      phone: '0123456789',
    };

    it('should validate and return user context when token has active session in Redis', async () => {
      mockSessionService.getSession.mockResolvedValue(activeSession);
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const payload = {
        id: 'user123',
        sessionId: 'sess_abc123',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: 'user123',
        _id: 'user123',
        email: 'user@example.com',
        username: 'validuser',
        phone: '0123456789',
        sessionId: 'sess_abc123',
      });
      expect(mockSessionService.getSession).toHaveBeenCalledWith(
        'user123',
        'sess_abc123',
      );
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user123');
    });

    it('should throw UnauthorizedException when payload is missing or lacks sessionId', async () => {
      await expect(
        strategy.validate(null as unknown as JwtPayload),
      ).rejects.toThrow(
        new UnauthorizedException('Token payload không hợp lệ'),
      );
      await expect(
        strategy.validate({ id: 'user123' } as unknown as JwtPayload),
      ).rejects.toThrow(
        new UnauthorizedException('Token payload không hợp lệ'),
      );
      await expect(
        strategy.validate({ sessionId: 'sess123' } as unknown as JwtPayload),
      ).rejects.toThrow(
        new UnauthorizedException('Token payload không hợp lệ'),
      );
    });

    it('should reject REST request when session does not exist or was revoked in Redis', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      const payload = {
        id: 'user123',
        sessionId: 'revoked_sess_456',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException(
          'Phiên đăng nhập không tồn tại hoặc đã bị thu hồi',
        ),
      );
      expect(mockSessionService.getSession).toHaveBeenCalledWith(
        'user123',
        'revoked_sess_456',
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('should reject REST request when session in Redis is expired', async () => {
      const expiredSession = {
        userId: 'user123',
        sessionId: 'expired_sess',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      mockSessionService.getSession.mockResolvedValue(expiredSession);

      const payload = {
        id: 'user123',
        sessionId: 'expired_sess',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('Phiên đăng nhập đã hết hạn'),
      );
    });

    it('should fail closed with UnauthorizedException when Redis store throws an error', async () => {
      mockSessionService.getSession.mockRejectedValue(
        new Error('Redis connection refused / cluster timeout'),
      );

      const payload = {
        id: 'user123',
        sessionId: 'sess_abc123',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('Không thể xác thực phiên đăng nhập'),
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user does not exist in database', async () => {
      mockSessionService.getSession.mockResolvedValue(activeSession);
      mockUsersService.findOne.mockResolvedValue(null);

      const payload = {
        id: 'nonexistentUser',
        sessionId: 'sess_abc123',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('Người dùng không tồn tại'),
      );
    });
  });
});
