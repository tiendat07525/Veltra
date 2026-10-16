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
      const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.register) as number;
      const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.register) as number;

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
});
