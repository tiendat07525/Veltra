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
  };

  const mockSessionService = {
    createSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
    revokeSession: jest.fn(),
  };

  const mockRealtimeService = {
    disconnectUser: jest.fn(),
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
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should reject registration if username already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue({ _id: 'existing2' });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Username đã tồn tại'),
      );
      expect(mockUsersService.findByUsername).toHaveBeenCalledWith(registerDto.username);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should hash password with bcrypt (10 rounds) and invoke usersService.create without returning password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(null);
      mockUsersService.create.mockImplementation((dto: { username: string; email: string; password: string }) => {
        return Promise.resolve({
          message: 'Tạo user thành công',
          data: {
            _id: 'newUserId',
            username: dto.username,
            email: dto.email,
          },
        });
      });

      const result = await service.register(registerDto);

      expect(mockUsersService.create).toHaveBeenCalled();
      const createArg = mockUsersService.create.mock.calls[0][0] as { password: string };

      // Password must NOT be plaintext
      expect(createArg.password).not.toEqual(registerDto.password);
      // Password must be a valid bcrypt hash
      expect(createArg.password.startsWith('$2b$10$')).toBe(true);

      const isValidBcrypt = await bcrypt.compare(registerDto.password, createArg.password);
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
      ).rejects.toThrow(new UnauthorizedException('Username hoặc mật khẩu không chính xác'));
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
      ).rejects.toThrow(new UnauthorizedException('Username hoặc mật khẩu không chính xác'));
    });
  });
});
