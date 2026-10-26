import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from '../src/users/users.service';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

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
    countDocuments: jest.fn(),
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

      mockUserModel.create.mockImplementation(
        (dto: Record<string, unknown>) => {
          return Promise.resolve(
            mockCreatedDoc({ _id: 'generatedId', ...dto }),
          );
        },
      );

      const result = await service.create(plaintextDto);

      expect(mockUserModel.create).toHaveBeenCalled();
      const callArg = mockUserModel.create.mock.calls[0][0] as {
        password: string;
      };

      // Verify the persisted password is NOT the plaintext password
      expect(callArg.password).not.toEqual('PlainTextPassword123!');
      // Verify it is a valid bcrypt hash
      expect(
        callArg.password.startsWith('$2b$') ||
          callArg.password.startsWith('$2a$'),
      ).toBe(true);
      const isMatch = await bcrypt.compare(
        'PlainTextPassword123!',
        callArg.password,
      );
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

      mockUserModel.create.mockImplementation(
        (callDto: Record<string, unknown>) => {
          return Promise.resolve(
            mockCreatedDoc({ _id: 'generatedId2', ...callDto }),
          );
        },
      );

      const result = await service.create(dto);

      expect(mockUserModel.create).toHaveBeenCalled();
      const callArg = mockUserModel.create.mock.calls[0][0] as {
        password: string;
      };
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
      expect(
        (user as unknown as Record<string, unknown>).password,
      ).toBeUndefined();
    });

    it('should never expose password in findPublicProfile', async () => {
      const id = new Types.ObjectId().toString();
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'user1',
            username: 'user1',
            displayName: 'User One',
          }),
        }),
      });

      const user = await service.findPublicProfile(id);
      expect(
        (user as unknown as Record<string, unknown>).password,
      ).toBeUndefined();
    });

    it('should reject a malformed id with 400 before querying', async () => {
      await expect(service.findPublicProfile('abc')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserModel.findById).not.toHaveBeenCalled();
    });

    it('should exclude password from queries at the schema level', () => {
      expect(UserSchema.path('password').options.select).toBe(false);
    });

    it('findByUsernameWithPassword should explicitly select the hash', async () => {
      const select = jest
        .fn()
        .mockResolvedValue({ username: 'alice', password: 'hash' });
      mockUserModel.findOne.mockReturnValue({ select });

      await service.findByUsernameWithPassword('alice');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ username: 'alice' });
      expect(select).toHaveBeenCalledWith('+password');
    });

    it('findByUsernameWithPassword should reject non-string input', async () => {
      await expect(
        service.findByUsernameWithPassword({ $ne: '' } as unknown as string),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('Authorization / BOLA Protection', () => {
    it('should throw ForbiddenException if user tries to update another user account', async () => {
      await expect(
        service.update('targetId', { bio: 'hacked' }, 'attackerId'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user tries to delete another user account', async () => {
      await expect(service.remove('targetId', 'attackerId')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('FULLAUDIT-004 Remediation: Bounded User Listing & Pagination', () => {
    const mockQueryBuilder = (result: any[]) => {
      const q: any = {};
      q.select = jest.fn().mockReturnValue(q);
      q.sort = jest.fn().mockReturnValue(q);
      q.skip = jest.fn().mockReturnValue(q);
      q.limit = jest.fn().mockReturnValue(q);
      q.lean = jest.fn().mockResolvedValue(result);
      return q;
    };

    it('should bound default result size (page 1, limit 20) and not retrieve entire collection', async () => {
      const sampleUsers = [
        { _id: 'u1', username: 'user1' },
        { _id: 'u2', username: 'user2' },
      ];
      const qb = mockQueryBuilder(sampleUsers);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(100);

      const result = await service.findAll();

      expect(mockUserModel.find).toHaveBeenCalledWith({});
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.limit).toHaveBeenCalledWith(20);
      expect(qb.select).toHaveBeenCalledWith(
        '_id username displayName avatarUrl bio onlineStatus lastSeen',
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(5);
      expect(result.data).toEqual(sampleUsers);
    });

    it('should clamp requested limit above 50 to the server maximum of 50', async () => {
      const qb = mockQueryBuilder([]);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(0);

      const result = await service.findAll({ limit: 1000, page: 1 });

      expect(qb.limit).toHaveBeenCalledWith(50);
      expect(result.limit).toBe(50);
    });

    it('should safely normalize invalid pagination values (negative, NaN, zero) without throwing HTTP 500', async () => {
      const qb = mockQueryBuilder([]);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(10);

      const result = await service.findAll({
        page: -10,
        limit: 'invalid' as any,
      });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.limit).toHaveBeenCalledWith(20);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should exclude password hashes and sensitive internal fields from selected fields', async () => {
      const qb = mockQueryBuilder([]);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 });

      const selectArg = qb.select.mock.calls[0][0];
      expect(selectArg).not.toContain('password');
      expect(selectArg).not.toContain('refreshToken');
      expect(selectArg).toBe(
        '_id username displayName avatarUrl bio onlineStatus lastSeen',
      );
    });

    it('should filter safely by search query without throwing on regex special characters', async () => {
      const qb = mockQueryBuilder([]);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.findAll({ search: 'user.*+?^${}()|[]\\' });

      expect(mockUserModel.find).toHaveBeenCalled();
      const findFilter = mockUserModel.find.mock.calls[0][0];
      expect(findFilter.$or).toBeDefined();
      expect(findFilter.$or.length).toBe(2);
    });

    it('should search only username and displayName, never email', async () => {
      const qb = mockQueryBuilder([]);
      mockUserModel.find.mockReturnValue(qb);
      mockUserModel.countDocuments.mockResolvedValue(0);

      await service.findAll({ search: 'alice' });

      const findFilter = mockUserModel.find.mock.calls[0][0];
      const fields = findFilter.$or.map((c: object) => Object.keys(c)[0]);
      expect(fields).toEqual(['username', 'displayName']);
      expect(fields).not.toContain('email');
      expect(findFilter.$or[0].username.test('ALICE_99')).toBe(true);
    });
  });
});
