import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationService } from '../src/conversation/conversation.service';
import { MessageService } from '../src/messages/message.service';
import {
  Conversation,
  ConversationSchema,
  getDirectKey,
} from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { UsersService } from '../src/users/users.service';
import { RealtimeService } from '../src/realtime/realtime.service';

describe('FULLAUDIT-010: Direct Conversation Deduplication & Concurrency Protection', () => {
  let conversationService: ConversationService;
  let messageService: MessageService;

  const userAId = new Types.ObjectId('670000000000000000000001');
  const userBId = new Types.ObjectId('670000000000000000000002');
  const userCId = new Types.ObjectId('670000000000000000000003');

  const mockConversationModel: any = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockMessageModel: any = {
    create: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockRealtimeService = {
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
          provide: RealtimeService,
          useValue: mockRealtimeService,
        },
      ],
    }).compile();

    conversationService = module.get<ConversationService>(ConversationService);
    messageService = module.get<MessageService>(MessageService);

    jest.clearAllMocks();
  });

  describe('1. Canonical Key Function (getDirectKey)', () => {
    it('should generate identical canonical keys regardless of argument order (symmetry)', () => {
      const keyAB = getDirectKey(userAId, userBId);
      const keyBA = getDirectKey(userBId, userAId);

      expect(keyAB).toBe(`${userAId.toString()}:${userBId.toString()}`);
      expect(keyBA).toBe(`${userAId.toString()}:${userBId.toString()}`);
      expect(keyAB).toBe(keyBA);
    });

    it('should generate different canonical keys for different user pairs', () => {
      const keyAB = getDirectKey(userAId, userBId);
      const keyAC = getDirectKey(userAId, userCId);

      expect(keyAB).not.toBe(keyAC);
    });
  });

  describe('2. Schema Index Definition', () => {
    it('should define a partial unique index on directKey ensuring group chats are unaffected', () => {
      const indexes = ConversationSchema.indexes();
      const directKeyIndex = indexes.find(
        ([fields]) => (fields as any).directKey === 1,
      );

      expect(directKeyIndex).toBeDefined();
      const options = directKeyIndex![1] as any;
      expect(options.unique).toBe(true);
      expect(options.partialFilterExpression).toEqual({
        directKey: { $type: 'string' },
      });
    });
  });

  describe('3. ConversationService.create (Direct Conversations)', () => {
    const mockPopulatedConversation = (
      id: Types.ObjectId,
      directKey: string,
    ) => ({
      _id: id,
      type: 'direct',
      directKey,
      participants: [
        {
          userId: { _id: userAId, displayName: 'User A', avatarUrl: null },
          joinedAt: new Date(),
        },
        {
          userId: { _id: userBId, displayName: 'User B', avatarUrl: null },
          joinedAt: new Date(),
        },
      ],
      unreadCounts: new Map(),
      toObject: function () {
        return {
          _id: this._id,
          type: this.type,
          directKey: this.directKey,
          participants: this.participants,
          unreadCounts: {},
        };
      },
      populate: jest.fn().mockResolvedValue(true),
    });

    it('should create a new direct conversation with directKey when none exists', async () => {
      const convId = new Types.ObjectId();
      const expectedKey = getDirectKey(userAId, userBId);
      const createdConv = mockPopulatedConversation(convId, expectedKey);

      // findOne returns null -> none exists
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null),
        }),
      });

      mockConversationModel.create.mockResolvedValue(createdConv);

      const result = await conversationService.create(
        {
          type: 'direct',
          participants: [userBId.toString()],
        },
        userAId.toString(),
      );

      expect(mockConversationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'direct',
          directKey: expectedKey,
          participants: expect.arrayContaining([
            expect.objectContaining({ userId: userAId }),
            expect.objectContaining({ userId: userBId }),
          ]),
        }),
      );
      expect(result._id).toEqual(convId);
    });

    it('should return existing conversation when one already exists (repeated request)', async () => {
      const convId = new Types.ObjectId();
      const expectedKey = getDirectKey(userAId, userBId);
      const existingConv = mockPopulatedConversation(convId, expectedKey);

      // findOne finds existing conversation
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(existingConv),
        }),
      });

      const result = await conversationService.create(
        {
          type: 'direct',
          participants: [userBId.toString()],
        },
        userAId.toString(),
      );

      expect(mockConversationModel.create).not.toHaveBeenCalled();
      expect(result._id).toEqual(convId);
    });

    it('should return the existing conversation when participant order is reversed (B requests A)', async () => {
      const convId = new Types.ObjectId();
      const expectedKey = getDirectKey(userAId, userBId);
      const existingConv = mockPopulatedConversation(convId, expectedKey);

      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(existingConv),
        }),
      });

      // User B creates with participant User A
      const result = await conversationService.create(
        {
          type: 'direct',
          participants: [userAId.toString()],
        },
        userBId.toString(),
      );

      // Verify the query checked for the symmetric canonical key
      expect(mockConversationModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'direct',
          $or: expect.arrayContaining([{ directKey: expectedKey }]),
        }),
      );
      expect(mockConversationModel.create).not.toHaveBeenCalled();
      expect(result._id).toEqual(convId);
    });

    it('should never match or reuse a group conversation as a direct chat', async () => {
      const convId = new Types.ObjectId();
      const expectedKey = getDirectKey(userAId, userBId);
      const createdConv = mockPopulatedConversation(convId, expectedKey);

      // findOne with type: 'direct' returns null because only group exists
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null),
        }),
      });
      mockConversationModel.create.mockResolvedValue(createdConv);

      const result = await conversationService.create(
        {
          type: 'direct',
          participants: [userBId.toString()],
        },
        userAId.toString(),
      );

      // Verify findOne strictly queried with type: 'direct'
      expect(mockConversationModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'direct' }),
      );
      expect(mockConversationModel.create).toHaveBeenCalled();
      expect(result._id).toEqual(convId);
    });

    it('should reject creating a direct conversation with oneself (400 Bad Request)', async () => {
      await expect(
        conversationService.create(
          {
            type: 'direct',
            participants: [userAId.toString()],
          },
          userAId.toString(),
        ),
      ).rejects.toThrow(
        new BadRequestException('Không thể tự tạo hội thoại với chính mình'),
      );
    });

    it('should reject creating direct conversation with invalid participant count', async () => {
      await expect(
        conversationService.create(
          {
            type: 'direct',
            participants: [userBId.toString(), userCId.toString()],
          },
          userAId.toString(),
        ),
      ).rejects.toThrow(
        new BadRequestException('Hội thoại trực tiếp cần 2 người'),
      );
    });

    it('should handle concurrency collision (E11000 duplicate key) and return winning conversation', async () => {
      const convId = new Types.ObjectId();
      const expectedKey = getDirectKey(userAId, userBId);
      const winningConv = mockPopulatedConversation(convId, expectedKey);

      // First findOne returns null (simulating concurrent gap)
      // Second findOne returns the winning conversation created by concurrent thread
      mockConversationModel.findOne
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue(winningConv),
        });

      // create throws MongoServerError E11000
      const duplicateKeyError: any = new Error(
        'E11000 duplicate key error collection: veltra.conversations index: directKey_1 dup key',
      );
      duplicateKeyError.code = 11000;
      mockConversationModel.create.mockRejectedValue(duplicateKeyError);

      const result = await conversationService.create(
        {
          type: 'direct',
          participants: [userBId.toString()],
        },
        userAId.toString(),
      );

      expect(result._id).toEqual(convId);
    });
  });

  describe('4. MessageService.sendDirectMessage (Deduplication & Reuse)', () => {
    const mockExistingConversation = (convId: Types.ObjectId) => ({
      _id: convId,
      type: 'direct',
      participants: [
        { userId: userAId, joinedAt: new Date() },
        { userId: userBId, joinedAt: new Date() },
      ],
      lastMessage: null,
      lastMessageAt: new Date(),
      unreadCounts: new Map(),
    });

    const mockMessageDoc = (msgId: Types.ObjectId, convId: Types.ObjectId) => ({
      _id: msgId,
      conversationId: convId,
      senderId: userAId,
      content: 'Hello World',
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject: function () {
        return {
          _id: this._id,
          conversationId: this.conversationId,
          senderId: this.senderId,
          content: this.content,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        };
      },
    });

    it('should find and reuse existing direct conversation when conversationId is omitted', async () => {
      const convId = new Types.ObjectId();
      const msgId = new Types.ObjectId();
      const existingConv = mockExistingConversation(convId);
      const savedMsg = mockMessageDoc(msgId, convId);

      mockUsersService.findOne.mockResolvedValue({
        _id: userBId,
        username: 'userB',
      });
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(existingConv),
      });
      mockMessageModel.create.mockResolvedValue(savedMsg);
      mockConversationModel.findByIdAndUpdate.mockResolvedValue(existingConv);

      const result = await messageService.sendDirectMessage(
        {
          receiverId: userBId.toString(),
          content: 'Hello World',
        },
        userAId.toString(),
      );

      // Verify conversation was reused rather than creating a new one
      expect(mockConversationModel.create).not.toHaveBeenCalled();
      expect(mockMessageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: convId,
          senderId: userAId,
          content: 'Hello World',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data.conversationId).toBe(convId.toString());
    });

    it('should reuse existing direct conversation when recipient replies without conversationId', async () => {
      const convId = new Types.ObjectId();
      const msgId = new Types.ObjectId();
      const existingConv = mockExistingConversation(convId);
      const replyMsg = {
        _id: msgId,
        conversationId: convId,
        senderId: userBId,
        content: 'Hi back',
        createdAt: new Date(),
        updatedAt: new Date(),
        toObject: () => ({
          _id: msgId,
          conversationId: convId,
          senderId: userBId,
          content: 'Hi back',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      mockUsersService.findOne.mockResolvedValue({
        _id: userAId,
        username: 'userA',
      });
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(existingConv),
      });
      mockMessageModel.create.mockResolvedValue(replyMsg);
      mockConversationModel.findByIdAndUpdate.mockResolvedValue(existingConv);

      const result = await messageService.sendDirectMessage(
        {
          receiverId: userAId.toString(), // User B replies to User A
          content: 'Hi back',
        },
        userBId.toString(),
      );

      expect(mockConversationModel.create).not.toHaveBeenCalled();
      expect(result.data.conversationId).toBe(convId.toString());
    });

    it('should create new conversation with directKey when none exists for receiverId', async () => {
      const convId = new Types.ObjectId();
      const msgId = new Types.ObjectId();
      const newConv = mockExistingConversation(convId);
      const savedMsg = mockMessageDoc(msgId, convId);
      const expectedKey = getDirectKey(userAId, userBId);

      mockUsersService.findOne.mockResolvedValue({
        _id: userBId,
        username: 'userB',
      });
      // findOne returns null -> none exists
      mockConversationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });
      mockConversationModel.create.mockResolvedValue(newConv);
      mockMessageModel.create.mockResolvedValue(savedMsg);
      mockConversationModel.findByIdAndUpdate.mockResolvedValue(newConv);

      const result = await messageService.sendDirectMessage(
        {
          receiverId: userBId.toString(),
          content: 'Hello World',
        },
        userAId.toString(),
      );

      expect(mockConversationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'direct',
          directKey: expectedKey,
        }),
      );
      expect(result.data.conversationId).toBe(convId.toString());
    });

    it('should handle concurrent sendDirectMessage race condition via E11000 duplicate key recovery', async () => {
      const convId = new Types.ObjectId();
      const msgId = new Types.ObjectId();
      const winningConv = mockExistingConversation(convId);
      const savedMsg = mockMessageDoc(msgId, convId);

      mockUsersService.findOne.mockResolvedValue({
        _id: userBId,
        username: 'userB',
      });

      // First findOne returns null, second findOne (after E11000 catch) returns winning conversation
      mockConversationModel.findOne
        .mockReturnValueOnce({
          sort: jest.fn().mockResolvedValue(null),
        })
        .mockResolvedValueOnce(winningConv);

      const duplicateKeyError: any = new Error(
        'E11000 duplicate key error collection: veltra.conversations index: directKey_1 dup key',
      );
      duplicateKeyError.code = 11000;
      mockConversationModel.create.mockRejectedValue(duplicateKeyError);

      mockMessageModel.create.mockResolvedValue(savedMsg);
      mockConversationModel.findByIdAndUpdate.mockResolvedValue(winningConv);

      const result = await messageService.sendDirectMessage(
        {
          receiverId: userBId.toString(),
          content: 'Concurrent Hello',
        },
        userAId.toString(),
      );

      expect(result.success).toBe(true);
      expect(result.data.conversationId).toBe(convId.toString());
    });

    it('should reject self-messaging with 400 Bad Request', async () => {
      await expect(
        messageService.sendDirectMessage(
          {
            receiverId: userAId.toString(),
            content: 'Message to self',
          },
          userAId.toString(),
        ),
      ).rejects.toThrow(
        new BadRequestException('Không thể gửi tin nhắn cho chính mình'),
      );
    });

    it('should reject request when neither conversationId nor receiverId is provided', async () => {
      await expect(
        messageService.sendDirectMessage(
          {
            content: 'Orphan message',
          },
          userAId.toString(),
        ),
      ).rejects.toThrow(
        new BadRequestException('Cần cung cấp conversationId hoặc receiverId'),
      );
    });

    it('should reject message when receiver does not exist in database (404 Not Found)', async () => {
      mockUsersService.findOne.mockResolvedValue(null);

      await expect(
        messageService.sendDirectMessage(
          {
            receiverId: new Types.ObjectId().toString(),
            content: 'Message to phantom',
          },
          userAId.toString(),
        ),
      ).rejects.toThrow(new NotFoundException('Người nhận không tồn tại'));
    });
  });
});
