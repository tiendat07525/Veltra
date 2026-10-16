import { Test, TestingModule } from '@nestjs/testing';
import { FriendService } from './friend.service';
import { getModelToken } from '@nestjs/mongoose';
import { Friend } from './schema/friend.schema';
import { FriendRequest } from './schema/friend-request.schema';
import { User } from 'src/users/schemas/user.schema';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

describe('FriendService (FULLAUDIT-007: Recipient Existence & Authorization)', () => {
  let service: FriendService;

  const mockFriendModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockFriendRequestModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockUserModel = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendService,
        {
          provide: getModelToken(Friend.name),
          useValue: mockFriendModel,
        },
        {
          provide: getModelToken(FriendRequest.name),
          useValue: mockFriendRequestModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<FriendService>(FriendService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendFriendRequest (FULLAUDIT-007 Verification)', () => {
    const senderId = new Types.ObjectId().toString();
    const recipientId = new Types.ObjectId().toString();

    it('should successfully send friend request when recipient exists and no prior relationship', async () => {
      // Mock recipient exists in database
      mockUserModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(recipientId),
        username: 'bob',
      });
      mockFriendModel.findOne.mockResolvedValue(null);
      mockFriendRequestModel.findOne.mockResolvedValue(null);
      mockFriendRequestModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        from: new Types.ObjectId(senderId),
        to: new Types.ObjectId(recipientId),
        message: 'Hello!',
      });

      const result = await service.sendFriendRequest(
        { to: recipientId, message: 'Hello!' },
        senderId,
      );

      expect(result.status).toBe(true);
      expect(result.message).toBe('Gửi lời mời kết bạn thành công');
      expect(mockUserModel.findById).toHaveBeenCalledWith(
        new Types.ObjectId(recipientId),
      );
      expect(mockFriendRequestModel.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when recipient user does not exist in database', async () => {
      // Mock recipient NOT found in database
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.sendFriendRequest({ to: recipientId }, senderId),
      ).rejects.toThrow(new NotFoundException('Người nhận không tồn tại'));

      expect(mockUserModel.findById).toHaveBeenCalledWith(
        new Types.ObjectId(recipientId),
      );
      expect(mockFriendRequestModel.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when recipient ID is malformed', async () => {
      await expect(
        service.sendFriendRequest({ to: 'invalid-id' }, senderId),
      ).rejects.toThrow(new BadRequestException('ID người nhận không hợp lệ'));
    });

    it('should throw BadRequestException when sending friend request to self', async () => {
      await expect(
        service.sendFriendRequest({ to: senderId }, senderId),
      ).rejects.toThrow(
        new BadRequestException(
          'Người gửi và người nhận không được giống nhau',
        ),
      );
      expect(mockUserModel.findById).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when users are already friends', async () => {
      mockUserModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(recipientId),
      });
      mockFriendModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      mockFriendRequestModel.findOne.mockResolvedValue(null);

      await expect(
        service.sendFriendRequest({ to: recipientId }, senderId),
      ).rejects.toThrow(
        new BadRequestException('Bạn đã là bạn với người này'),
      );
    });

    it('should throw BadRequestException when friend request is already pending', async () => {
      mockUserModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(recipientId),
      });
      mockFriendModel.findOne.mockResolvedValue(null);
      mockFriendRequestModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.sendFriendRequest({ to: recipientId }, senderId),
      ).rejects.toThrow(
        new BadRequestException(
          'Bạn đã gửi hoặc nhận lời mời kết bạn với người này',
        ),
      );
    });
  });

  describe('acceptFriendRequest', () => {
    const userId = new Types.ObjectId().toString();
    const requestId = new Types.ObjectId().toString();
    const senderId = new Types.ObjectId().toString();

    it('should accept friend request when target is the current user', async () => {
      mockFriendRequestModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(requestId),
        from: new Types.ObjectId(senderId),
        to: new Types.ObjectId(userId),
      });
      mockFriendModel.findOne.mockResolvedValue(null);
      mockFriendModel.create.mockResolvedValue({});
      mockFriendRequestModel.findByIdAndDelete.mockResolvedValue({});

      const result = await service.acceptFriendRequest(requestId, userId);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Chấp nhận lời mời kết bạn thành công');
      expect(mockFriendModel.create).toHaveBeenCalled();
      expect(mockFriendRequestModel.findByIdAndDelete).toHaveBeenCalledWith(
        requestId,
      );
    });

    it('should throw ForbiddenException if accepting a request not addressed to caller', async () => {
      mockFriendRequestModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(requestId),
        from: new Types.ObjectId(senderId),
        to: new Types.ObjectId(), // Different recipient
      });

      await expect(
        service.acceptFriendRequest(requestId, userId),
      ).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền chấp nhận lời mời này'),
      );
    });

    it('should throw NotFoundException if request does not exist', async () => {
      mockFriendRequestModel.findById.mockResolvedValue(null);

      await expect(
        service.acceptFriendRequest(requestId, userId),
      ).rejects.toThrow(
        new NotFoundException('Không tìm thấy lời mời kết bạn'),
      );
    });
  });

  describe('declineFriendRequest', () => {
    const userId = new Types.ObjectId().toString();
    const requestId = new Types.ObjectId().toString();

    it('should decline friend request successfully', async () => {
      mockFriendRequestModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(requestId),
        to: new Types.ObjectId(userId),
      });
      mockFriendRequestModel.findByIdAndDelete.mockResolvedValue({});

      const result = await service.declineFriendRequest(requestId, userId);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Từ chối lời mời kết bạn thành công');
      expect(mockFriendRequestModel.findByIdAndDelete).toHaveBeenCalledWith(
        requestId,
      );
    });
  });
});
