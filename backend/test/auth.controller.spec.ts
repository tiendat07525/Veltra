import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

describe('AuthController (Security & Rate Limiting)', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('FULLAUDIT-001 Remediation: Registration Security & Rate Limiting', () => {
    it('should have rate limiting metadata applied to register endpoint (5 requests per 60s)', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const targetMethod = AuthController.prototype.register;
      const ttl = Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        targetMethod,
      ) as number;
      const limit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        targetMethod,
      ) as number;

      expect(ttl).toBe(60000);
      expect(limit).toBe(5);
    });

    it('should delegate registration to AuthService.register', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'Password123!',
      };
      const serviceResponse = {
        message: 'Tạo user thành công',
        data: {
          _id: 'newUserId',
          username: 'newuser',
          email: 'newuser@example.com',
        },
      };

      mockAuthService.register.mockResolvedValue(serviceResponse);

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(serviceResponse);
      const dataRecord = result.data as Record<string, unknown>;
      expect(dataRecord.password).toBeUndefined();
    });
  });

  describe('FULLAUDIT-008 Remediation: Rate Limiting on /auth/refresh', () => {
    it('should have targeted rate limiting metadata applied to refresh endpoint (15 requests per 60s)', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const targetMethod = AuthController.prototype.refresh;
      const ttl = Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        targetMethod,
      ) as number;
      const limit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        targetMethod,
      ) as number;

      expect(ttl).toBe(60000);
      expect(limit).toBe(15);
    });

    it('should delegate refresh to AuthService.refresh and update cookie', async () => {
      const mockReq: any = {
        cookies: {
          refreshToken: 'user1.sess1.rawTokenHex',
        },
        headers: {
          'user-agent': 'Jest-Agent',
        },
        ip: '127.0.0.1',
      };

      const mockRes: any = {
        cookie: jest.fn(),
      };

      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-mock-access-token',
        refreshTokenString: 'user1.sess1.newRotatedTokenHex',
      });

      const result = await controller.refresh(mockReq, mockRes);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'user1.sess1.rawTokenHex',
        'Jest-Agent',
        '127.0.0.1',
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'user1.sess1.newRotatedTokenHex',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
        }),
      );
      expect(result).toEqual({ accessToken: 'new-mock-access-token' });
    });

    it('should keep the existing cookie when refresh happens in the grace period', async () => {
      const mockReq: any = {
        cookies: {
          refreshToken: 'user1.sess1.previousTokenHex',
        },
        headers: {
          'user-agent': 'Jest-Agent',
        },
        ip: '127.0.0.1',
      };

      const mockRes: any = {
        cookie: jest.fn(),
      };

      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'grace-access-token',
        refreshTokenString: null,
      });

      const result = await controller.refresh(mockReq, mockRes);

      expect(mockRes.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'grace-access-token' });
    });
  });
});
