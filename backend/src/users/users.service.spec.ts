import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { ForbiddenException } from '@nestjs/common';

describe('UsersService (Security & Password Hashing)', () => {
  let service: UsersService;

  const mockCreatedDoc = (data: Record<string, unknown>) => ({
    toObject: () => ({ ...data }),
  });

  const mockUserModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('FULLAUDIT-001 Remediation: Password Hashing & Exclusion', () => {
    it('should hash a plaintext password with bcrypt before persisting', async () => {
      const plaintextDto = {
        username: 'testsecure',
        email: 'test@secure.com',
        password: 'PlainTextPassword123!',
      };

      mockUserModel.create.mockImplementation((dto: Record<string, unknown>) => {
        return Promise.resolve(mockCreatedDoc({ _id: 'generatedId', ...dto }));
      });

      const result = await service.create(plaintextDto);

      expect(mockUserModel.create).toHaveBeenCalled();
      const callArg = mockUserModel.create.mock.calls[0][0] as { password: string };

      // Verify the persisted password is NOT the plaintext password
      expect(callArg.password).not.toEqual('PlainTextPassword123!');
      // Verify it is a valid bcrypt hash
      expect(callArg.password.startsWith('$2b$') || callArg.password.startsWith('$2a$')).toBe(true);
      const isMatch = await bcrypt.compare('PlainTextPassword123!', callArg.password);
      expect(isMatch).toBe(true);

      // Verify password is NEVER returned in the response
      expect((result.data as Record<string, unknown>).password).toBeUndefined();
      expect(result.message).toBe('Tạo user thành công');
    });

    it('should preserve an already hashed bcrypt password without double hashing', async () => {
      const preHashedPassword = await bcrypt.hash('PreHashedPassword123!', 10);
      const dto = {
        username: 'testprehash',
        email: 'prehash@secure.com',
        password: preHashedPassword,
      };

      mockUserModel.create.mockImplementation((callDto: Record<string, unknown>) => {
        return Promise.resolve(mockCreatedDoc({ _id: 'generatedId2', ...callDto }));
      });

      const result = await service.create(dto);

      expect(mockUserModel.create).toHaveBeenCalled();
      const callArg = mockUserModel.create.mock.calls[0][0] as { password: string };
      expect(callArg.password).toEqual(preHashedPassword);
      expect((result.data as Record<string, unknown>).password).toBeUndefined();
    });

    it('should never expose password in findOne', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'user1',
            username: 'user1',
            email: 'user1@example.com',
          }),
        }),
      });

      const user = await service.findOne('user1');
      expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
    });

    it('should never expose password in findPublicProfile', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'user1',
            username: 'user1',
            displayName: 'User One',
          }),
        }),
      });

      const user = await service.findPublicProfile('user1');
      expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
    });
  });

  describe('Authorization / BOLA Protection', () => {
    it('should throw ForbiddenException if user tries to update another user account', async () => {
      await expect(
        service.update('targetId', { bio: 'hacked' }, 'attackerId'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user tries to delete another user account', async () => {
      await expect(
        service.remove('targetId', 'attackerId'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
