import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import { MessageService } from '../src/messages/message.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { UsersService } from 'src/users/users.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeService } from '../src/realtime/realtime.service';
import { UpdateConversationDto } from '../src/conversation/dto/update-conversation.dto';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Authorization & IDOR/BOLA Protection Suite (P1.3)', () => {
  let conversationService: ConversationService;
  let messageService: MessageService;

  const validConversationId = new Types.ObjectId().toString();
  const validMessageId = new Types.ObjectId().toString();
  const creatorUserId = new Types.ObjectId().toString();
  const memberUserId = new Types.ObjectId().toString();
  const outsiderUserId = new Types.ObjectId().toString();

  const mockConversationModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockMessageModel = {
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockRealtimeGateway = {
    server: {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    },
  };

  const mockRealtimeService = {
    emitToConversation: jest.fn(),
    emitToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        MessageService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        {
          provide: getModelToken(Message.name),
          useValue: mockMessageModel,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtimeGateway,
        },
        {
          provide: RealtimeService,
          useValue: mockRealtimeService,
        },
      ],
    }).compile();

    conversationService = module.get<ConversationService>(ConversationService);
    messageService = module.get<MessageService>(MessageService);
    jest.clearAllMocks();
  });

  describe('Conversation Message Access Control & IDOR Prevention', () => {
    it('should allow legitimate participant to retrieve messages', async () => {
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        participants: [{ userId: new Types.ObjectId(memberUserId) }],
      });

      const sampleMsg = {
        _id: new Types.ObjectId(),
        conversationId: new Types.ObjectId(validConversationId),
        senderId: new Types.ObjectId(memberUserId),
        content: 'Hello World',
        createdAt: new Date(),
      };

      const queryBuilder: any = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([sampleMsg]),
      };
      mockMessageModel.find.mockReturnValue(queryBuilder);

      const result = await conversationService.getMessages(
        validConversationId,
        memberUserId,
        20,
      );

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(validConversationId),
        'participants.userId': new Types.ObjectId(memberUserId),
      });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].content).toBe('Hello World');
    });

    it('should reject non-participant attempting to retrieve conversation messages (IDOR defense)', async () => {
      mockConversationModel.findOne.mockResolvedValue(null); // Not a participant

      await expect(
        conversationService.getMessages(validConversationId, outsiderUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject malformed conversation IDs with BadRequestException', async () => {
      await expect(
        conversationService.getMessages('invalid-hex-id', memberUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Group Conversation Management & Creator-Only Access Control', () => {
    it('should allow group creator to delete group conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: { createdBy: new Types.ObjectId(creatorUserId) },
      });
      mockConversationModel.findByIdAndDelete.mockResolvedValue({});
      mockMessageModel.deleteMany.mockResolvedValue({});

      const result = await conversationService.remove(
        validConversationId,
        creatorUserId,
      );

      expect(result).toEqual({ message: 'Đã xóa cuộc trò chuyện' });
      expect(mockConversationModel.findByIdAndDelete).toHaveBeenCalledWith(
        validConversationId,
      );
    });

    it('should reject non-creator member attempting to delete group conversation (403 Forbidden)', async () => {
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: { createdBy: new Types.ObjectId(creatorUserId) }, // created by someone else
      });

      await expect(
        conversationService.remove(validConversationId, memberUserId),
      ).rejects.toThrow(
        new ForbiddenException('Chỉ trưởng nhóm mới có quyền xóa nhóm'),
      );
      expect(mockConversationModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('should allow group creator to rename group conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: {
          createdBy: new Types.ObjectId(creatorUserId),
          name: 'Old Name',
        },
        participants: [{ userId: new Types.ObjectId(creatorUserId) }],
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: { name: 'New Name' },
          participants: [],
        }),
      });
      mockConversationModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'New Name' },
            participants: [],
          }),
        }),
      });

      const updateDto: UpdateConversationDto = { groupName: 'New Name' };
      const result = await conversationService.update(
        validConversationId,
        updateDto,
        creatorUserId,
      );

      expect(result).toBeDefined();
    });

    it('should reject non-creator attempting to rename group conversation (403 Forbidden)', async () => {
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: {
          createdBy: new Types.ObjectId(creatorUserId),
          name: 'Old Name',
        },
      });

      const updateDto: UpdateConversationDto = {
        groupName: 'Hacked Group Name',
      };
      await expect(
        conversationService.update(
          validConversationId,
          updateDto,
          memberUserId,
        ),
      ).rejects.toThrow(
        new ForbiddenException('Chỉ trưởng nhóm mới có quyền đổi tên nhóm'),
      );
    });

    it('should allow group creator to add participants to group', async () => {
      const newParticipantId = new Types.ObjectId().toString();
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: { createdBy: new Types.ObjectId(creatorUserId) },
        participants: [{ userId: new Types.ObjectId(creatorUserId) }],
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          participants: [
            {
              userId: { _id: creatorUserId, displayName: 'Creator' },
              joinedAt: new Date(),
            },
            {
              userId: { _id: newParticipantId, displayName: 'New' },
              joinedAt: new Date(),
            },
          ],
        }),
      });
      mockConversationModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            participants: [],
          }),
        }),
      });

      const result = await conversationService.addParticipants(
        validConversationId,
        { userIds: [newParticipantId] },
        creatorUserId,
      );

      expect(result).toBeDefined();
    });

    it('should reject non-creator attempting to add participants (403 Forbidden)', async () => {
      const newParticipantId = new Types.ObjectId().toString();
      mockConversationModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        type: 'group',
        group: { createdBy: new Types.ObjectId(creatorUserId) },
      });

      await expect(
        conversationService.addParticipants(
          validConversationId,
          { userIds: [newParticipantId] },
          memberUserId,
        ),
      ).rejects.toThrow(
        new ForbiddenException('Chỉ trưởng nhóm mới có quyền thêm thành viên'),
      );
    });
  });

  describe('Message Revocation Access Control & Sender Verification', () => {
    it('should allow message sender to revoke their own message', async () => {
      const mockMessageDoc = {
        _id: new Types.ObjectId(validMessageId),
        senderId: new Types.ObjectId(creatorUserId),
        conversationId: new Types.ObjectId(validConversationId),
        isRevoked: false,
        content: 'Original secret message',
        save: jest.fn().mockResolvedValue(true),
      };
      mockMessageModel.findById.mockResolvedValue(mockMessageDoc);
      mockConversationModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(validConversationId),
        lastMessage: null,
      });

      const result = await messageService.revokeMessage(
        validMessageId,
        creatorUserId,
      );

      expect(mockMessageDoc.isRevoked).toBe(true);
      expect(mockMessageDoc.content).toBe('Tin nhắn đã thu hồi');
      expect(mockMessageDoc.save).toHaveBeenCalled();
      expect(result.data.isRevoked).toBe(true);
      expect(result.data.content).toBe('Tin nhắn đã thu hồi');
    });

    it('should reject different user attempting to revoke someone elses message (IDOR defense)', async () => {
      const mockMessageDoc = {
        _id: new Types.ObjectId(validMessageId),
        senderId: new Types.ObjectId(creatorUserId), // sent by creator
        conversationId: new Types.ObjectId(validConversationId),
        isRevoked: false,
        content: 'Original message',
      };
      mockMessageModel.findById.mockResolvedValue(mockMessageDoc);

      await expect(
        messageService.revokeMessage(validMessageId, outsiderUserId), // outsider tries to revoke
      ).rejects.toThrow(
        new BadRequestException('Bạn không có quyền thu hồi tin nhắn này'),
      );
    });

    it('should reject revocation of an already revoked message', async () => {
      const mockMessageDoc = {
        _id: new Types.ObjectId(validMessageId),
        senderId: new Types.ObjectId(creatorUserId),
        conversationId: new Types.ObjectId(validConversationId),
        isRevoked: true, // already revoked
        content: 'Tin nhắn đã thu hồi',
      };
      mockMessageModel.findById.mockResolvedValue(mockMessageDoc);

      await expect(
        messageService.revokeMessage(validMessageId, creatorUserId),
      ).rejects.toThrow(new BadRequestException('Tin nhắn này đã bị thu hồi'));
    });

    it('should reject revocation when message does not exist', async () => {
      mockMessageModel.findById.mockResolvedValue(null);

      await expect(
        messageService.revokeMessage(validMessageId, creatorUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
