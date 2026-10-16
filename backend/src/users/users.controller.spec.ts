import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

describe('UsersController (Security & Functionality)', () => {
  let controller: UsersController;

  const mockUsersService = {
    findOne: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    findPublicProfile: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('FULLAUDIT-001 Remediation: Removal of POST /users', () => {
    it('should NOT define a create method or POST route for unauthenticated account creation', () => {
      const controllerRecord = controller as unknown as Record<string, unknown>;
      const prototypeRecord = UsersController.prototype as unknown as Record<
        string,
        unknown
      >;
      expect(controllerRecord.create).toBeUndefined();
      expect(prototypeRecord.create).toBeUndefined();
    });
  });

  describe('Legitimate User Functionality', () => {
    it('should get own profile via getProfile', async () => {
      const mockUser = {
        _id: 'user1',
        username: 'testuser',
        email: 'test@example.com',
      };
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.getProfile({ user: { id: 'user1' } });
      expect(result).toEqual(mockUser);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user1');
    });

    it('should update own profile via updateProfile', async () => {
      const updateDto = { bio: 'New bio' };
      const updatedUser = {
        _id: 'user1',
        username: 'testuser',
        bio: 'New bio',
      };
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(
        { user: { id: 'user1' } },
        updateDto,
      );
      expect(result).toEqual(updatedUser);
      expect(mockUsersService.update).toHaveBeenCalledWith('user1', updateDto);
    });

    it('should find users via findAll with bounded pagination query', async () => {
      const paginatedResult = {
        data: [{ _id: 'user1', username: 'user1' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      mockUsersService.findAll.mockResolvedValue(paginatedResult);

      const queryDto = { page: 1, limit: 20, search: 'test' };
      const result = await controller.findAll(queryDto);
      expect(result).toEqual(paginatedResult);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(queryDto);
    });

    it('should find public profile via findOne', async () => {
      const publicUser = {
        _id: 'user2',
        username: 'user2',
        displayName: 'User Two',
      };
      mockUsersService.findPublicProfile.mockResolvedValue(publicUser);

      const result = await controller.findOne('user2');
      expect(result).toEqual(publicUser);
      expect(mockUsersService.findPublicProfile).toHaveBeenCalledWith('user2');
    });

    it('should update user via update with currentUserId', async () => {
      const updateDto = { displayName: 'Updated' };
      mockUsersService.update.mockResolvedValue({ _id: 'user1', ...updateDto });

      const result = await controller.update('user1', updateDto, {
        user: { id: 'user1' },
      });
      expect(result).toEqual({ _id: 'user1', ...updateDto });
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user1',
        updateDto,
        'user1',
      );
    });

    it('should delete user via remove with currentUserId', async () => {
      mockUsersService.remove.mockResolvedValue({
        message: 'Xóa user thành công',
      });

      const result = await controller.remove('user1', {
        user: { id: 'user1' },
      });
      expect(result).toEqual({ message: 'Xóa user thành công' });
      expect(mockUsersService.remove).toHaveBeenCalledWith('user1', 'user1');
    });
  });
});
