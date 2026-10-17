import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import { ConversationController } from '../src/conversation/conversation.controller';
import { MessageService } from '../src/messages/message.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { UsersService } from 'src/users/users.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeService } from '../src/realtime/realtime.service';
import { UpdateConversationDto } from '../src/conversation/dto/update-conversation.dto';
import { AddParticipantDto } from '../src/conversation/dto/add-participant.dto';
import { CreateConversationDto } from '../src/conversation/dto/create-conversation.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Authorization & IDOR/BOLA Protection Suite (P1.3)', () => {
  let conversationService: ConversationService;
  let conversationController: ConversationController;
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
      controllers: [ConversationController],
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
    conversationController = module.get<ConversationController>(
      ConversationController,
    );
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

  describe('Conversation ObjectId Validation Suite (P3-2 / FULLAUDIT-011)', () => {
    const nonexistentValidObjectId = new Types.ObjectId().toString();
    const malformedId = 'not-a-valid-mongo-id-123';

    describe('1. Malformed conversation ID rejection (400 Bad Request)', () => {
      it('should reject malformed conversationId in ConversationService.update without querying DB', async () => {
        await expect(
          conversationService.update(
            malformedId,
            { groupName: 'New Group Name' },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationController.update', async () => {
        const mockReq = { user: { _id: new Types.ObjectId(creatorUserId) } };
        await expect(
          conversationController.update(
            malformedId,
            { groupName: 'New Group Name' },
            mockReq,
          ),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationService.addParticipants without querying DB', async () => {
        await expect(
          conversationService.addParticipants(
            malformedId,
            { userIds: [memberUserId] },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationController.addParticipants', async () => {
        const mockReq = { user: { _id: new Types.ObjectId(creatorUserId) } };
        await expect(
          conversationController.addParticipants(
            malformedId,
            { userIds: [memberUserId] },
            mockReq,
          ),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationService.remove without querying DB', async () => {
        await expect(
          conversationService.remove(malformedId, creatorUserId),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationService.getMessages without querying DB', async () => {
        await expect(
          conversationService.getMessages(malformedId, memberUserId),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in ConversationService.markAsSeen without querying DB', async () => {
        await expect(
          conversationService.markAsSeen(malformedId, memberUserId),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed conversationId in MessageService.sendDirectMessage without querying DB', async () => {
        await expect(
          messageService.sendDirectMessage(
            { conversationId: malformedId, content: 'Test Message' },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new BadRequestException('Conversation ID không hợp lệ'),
        );

        expect(mockConversationModel.findById).not.toHaveBeenCalled();
      });
    });

    describe('2. Malformed participant/member ID rejection (400 Bad Request)', () => {
      it('should reject malformed member ID in ConversationService.addParticipants without querying DB', async () => {
        await expect(
          conversationService.addParticipants(
            validConversationId,
            { userIds: [malformedId] },
            creatorUserId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject array containing both valid and malformed member IDs in addParticipants', async () => {
        await expect(
          conversationService.addParticipants(
            validConversationId,
            { userIds: [memberUserId, malformedId] },
            creatorUserId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));

        expect(mockConversationModel.findOne).not.toHaveBeenCalled();
      });

      it('should reject malformed participant ID in direct conversation creation', async () => {
        await expect(
          conversationService.create(
            { type: 'direct', participants: [malformedId] },
            creatorUserId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));

        expect(mockConversationModel.create).not.toHaveBeenCalled();
      });

      it('should reject malformed participant ID in group conversation creation', async () => {
        await expect(
          conversationService.create(
            {
              type: 'group',
              groupName: 'Engineering',
              participants: [memberUserId, malformedId],
            },
            creatorUserId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));

        expect(mockConversationModel.create).not.toHaveBeenCalled();
      });

      it('should reject malformed receiverId in MessageService.sendDirectMessage', async () => {
        await expect(
          messageService.sendDirectMessage(
            { receiverId: malformedId, content: 'Hello' },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new BadRequestException('ID người nhận không hợp lệ'),
        );

        expect(mockUsersService.findOne).not.toHaveBeenCalled();
      });

      it('should fail DTO validation on AddParticipantDto when userIds contains malformed MongoId', async () => {
        const dto = plainToInstance(AddParticipantDto, {
          userIds: ['invalid-mongo-id'],
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('isMongoId');
      });

      it('should fail DTO validation on AddParticipantDto when userIds is empty', async () => {
        const dto = plainToInstance(AddParticipantDto, {
          userIds: [],
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('arrayMinSize');
      });

      it('should pass DTO validation on AddParticipantDto with valid MongoIds', async () => {
        const dto = plainToInstance(AddParticipantDto, {
          userIds: [validConversationId, memberUserId],
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail DTO validation on CreateConversationDto with malformed participants', async () => {
        const dto = plainToInstance(CreateConversationDto, {
          type: 'group',
          groupName: 'Valid Name',
          participants: ['not-valid-id'],
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('isMongoId');
      });
    });

    describe('3. Valid ObjectId referencing a nonexistent record (404 Not Found)', () => {
      it('should return 404 Not Found when updating a nonexistent conversation', async () => {
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.update(
            nonexistentValidObjectId,
            { groupName: 'New Name' },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException('Group không tồn tại hoặc bạn không có quyền'),
        );

        expect(mockConversationModel.findOne).toHaveBeenCalledWith({
          _id: new Types.ObjectId(nonexistentValidObjectId),
          type: 'group',
          'participants.userId': new Types.ObjectId(creatorUserId),
        });
      });

      it('should return 404 Not Found when adding participants to a nonexistent conversation', async () => {
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.addParticipants(
            nonexistentValidObjectId,
            { userIds: [memberUserId] },
            creatorUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException('Group không tồn tại hoặc bạn không có quyền'),
        );

        expect(mockConversationModel.findOne).toHaveBeenCalledWith({
          _id: new Types.ObjectId(nonexistentValidObjectId),
          type: 'group',
          'participants.userId': new Types.ObjectId(creatorUserId),
        });
      });

      it('should return 404 Not Found when deleting a nonexistent conversation', async () => {
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.remove(nonexistentValidObjectId, creatorUserId),
        ).rejects.toThrow(
          new NotFoundException(
            'Conversation không tồn tại hoặc bạn không có quyền',
          ),
        );
      });

      it('should return 404 Not Found when fetching messages for nonexistent conversation', async () => {
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.getMessages(
            nonexistentValidObjectId,
            creatorUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException(
            'Conversation không tồn tại hoặc bạn không có quyền truy cập',
          ),
        );
      });

      it('should return 404 Not Found when marking nonexistent conversation as seen', async () => {
        mockConversationModel.findOne.mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        });

        await expect(
          conversationService.markAsSeen(
            nonexistentValidObjectId,
            creatorUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException(
            'Conversation không tồn tại hoặc bạn không có quyền',
          ),
        );
      });
    });

    describe('4. Valid existing IDs with authorized access', () => {
      it('should allow group creator to update group conversation name', async () => {
        const mockSave = jest.fn().mockResolvedValue(true);
        const groupConversation = {
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Original Name',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            {
              userId: { _id: creatorUserId, displayName: 'Creator' },
              joinedAt: new Date(),
            },
          ],
          save: mockSave,
          toObject: () => ({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'Updated Name', createdBy: creatorUserId },
            participants: [
              {
                userId: { _id: creatorUserId, displayName: 'Creator' },
                joinedAt: new Date(),
              },
            ],
          }),
        };

        mockConversationModel.findOne.mockResolvedValue(groupConversation);

        const result = await conversationService.update(
          validConversationId,
          { groupName: 'Updated Name' },
          creatorUserId,
        );

        expect(groupConversation.group.name).toBe('Updated Name');
        expect(mockSave).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect(result.group?.name).toBe('Updated Name');
      });

      it('should allow group creator to add new valid participants', async () => {
        const newUserId = new Types.ObjectId().toString();
        const mockSave = jest.fn().mockResolvedValue(true);
        const groupConversation = {
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Team Group',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            { userId: new Types.ObjectId(creatorUserId), joinedAt: new Date() },
          ],
          save: mockSave,
          toObject: () => ({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'Team Group', createdBy: creatorUserId },
            participants: [
              {
                userId: { _id: creatorUserId, displayName: 'Creator' },
                joinedAt: new Date(),
              },
              {
                userId: { _id: newUserId, displayName: 'New Member' },
                joinedAt: new Date(),
              },
            ],
          }),
        };

        mockConversationModel.findOne.mockResolvedValue(groupConversation);

        const result = await conversationService.addParticipants(
          validConversationId,
          { userIds: [newUserId] },
          creatorUserId,
        );

        expect(mockSave).toHaveBeenCalled();
        expect(result.participants.length).toBe(2);
      });
    });

    describe('5. Valid existing IDs with unauthorized access', () => {
      it('should reject non-creator member updating group name with 403 Forbidden', async () => {
        mockConversationModel.findOne.mockResolvedValue({
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Protected Group',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            { userId: new Types.ObjectId(creatorUserId) },
            { userId: new Types.ObjectId(memberUserId) },
          ],
        });

        await expect(
          conversationService.update(
            validConversationId,
            { groupName: 'Malicious Rename' },
            memberUserId,
          ),
        ).rejects.toThrow(
          new ForbiddenException('Chỉ trưởng nhóm mới có quyền đổi tên nhóm'),
        );
      });

      it('should reject non-creator member adding participants with 403 Forbidden', async () => {
        mockConversationModel.findOne.mockResolvedValue({
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Protected Group',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            { userId: new Types.ObjectId(creatorUserId) },
            { userId: new Types.ObjectId(memberUserId) },
          ],
        });

        await expect(
          conversationService.addParticipants(
            validConversationId,
            { userIds: [outsiderUserId] },
            memberUserId,
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'Chỉ trưởng nhóm mới có quyền thêm thành viên',
          ),
        );
      });

      it('should reject outsider attempting to update group with 404 (IDOR defense)', async () => {
        // Conversation query filters by participants.userId: outsiderUserId -> returns null
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.update(
            validConversationId,
            { groupName: 'Hacked by Outsider' },
            outsiderUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException('Group không tồn tại hoặc bạn không có quyền'),
        );
      });

      it('should reject outsider attempting to add participants with 404 (IDOR defense)', async () => {
        mockConversationModel.findOne.mockResolvedValue(null);

        await expect(
          conversationService.addParticipants(
            validConversationId,
            { userIds: [outsiderUserId] },
            outsiderUserId,
          ),
        ).rejects.toThrow(
          new NotFoundException('Group không tồn tại hoặc bạn không có quyền'),
        );
      });
    });

    describe('6. Existing update and member-management behavior', () => {
      it('should be idempotent and avoid duplicating already existing participants', async () => {
        const mockSave = jest.fn().mockResolvedValue(true);
        const groupConversation = {
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Dev Team',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            { userId: new Types.ObjectId(creatorUserId), joinedAt: new Date() },
            { userId: new Types.ObjectId(memberUserId), joinedAt: new Date() },
          ],
          save: mockSave,
          toObject: () => ({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'Dev Team', createdBy: creatorUserId },
            participants: [
              { userId: { _id: creatorUserId, displayName: 'Creator' } },
              { userId: { _id: memberUserId, displayName: 'Member' } },
            ],
          }),
        };

        mockConversationModel.findOne.mockResolvedValue(groupConversation);

        // Attempt to add memberUserId who is already in the group
        await conversationService.addParticipants(
          validConversationId,
          { userIds: [memberUserId] },
          creatorUserId,
        );

        // Participants array should NOT grow
        expect(groupConversation.participants.length).toBe(2);
        expect(mockSave).toHaveBeenCalled();
      });

      it('should deduplicate multiple occurrences of the same user ID in userIds payload', async () => {
        const newUserId = new Types.ObjectId().toString();
        const mockSave = jest.fn().mockResolvedValue(true);
        const groupConversation = {
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Dev Team',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [
            { userId: new Types.ObjectId(creatorUserId), joinedAt: new Date() },
          ],
          save: mockSave,
          toObject: () => ({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'Dev Team', createdBy: creatorUserId },
            participants: [
              { userId: { _id: creatorUserId, displayName: 'Creator' } },
              { userId: { _id: newUserId, displayName: 'New User' } },
            ],
          }),
        };

        mockConversationModel.findOne.mockResolvedValue(groupConversation);

        // Send duplicate IDs in payload: [newUserId, newUserId]
        await conversationService.addParticipants(
          validConversationId,
          { userIds: [newUserId, newUserId] },
          creatorUserId,
        );

        // Only one new participant should be pushed
        expect(groupConversation.participants.length).toBe(2);
        expect(mockSave).toHaveBeenCalled();
      });

      it('should trim leading and trailing whitespace from groupName on update', async () => {
        const mockSave = jest.fn().mockResolvedValue(true);
        const groupConversation = {
          _id: new Types.ObjectId(validConversationId),
          type: 'group',
          group: {
            name: 'Old Name',
            createdBy: new Types.ObjectId(creatorUserId),
          },
          participants: [{ userId: new Types.ObjectId(creatorUserId) }],
          save: mockSave,
          toObject: () => ({
            _id: new Types.ObjectId(validConversationId),
            type: 'group',
            group: { name: 'Trimmed Name' },
            participants: [],
          }),
        };

        mockConversationModel.findOne.mockResolvedValue(groupConversation);

        await conversationService.update(
          validConversationId,
          { groupName: '   Trimmed Name   ' },
          creatorUserId,
        );

        expect(groupConversation.group.name).toBe('Trimmed Name');
        expect(mockSave).toHaveBeenCalled();
      });
    });

    describe('7. Other affected routes & user context validation', () => {
      it('should reject malformed userId in ConversationService.findAll', async () => {
        await expect(conversationService.findAll(malformedId)).rejects.toThrow(
          new BadRequestException('User ID không hợp lệ'),
        );
      });

      it('should reject malformed userId in ConversationService.update', async () => {
        await expect(
          conversationService.update(
            validConversationId,
            { groupName: 'Test' },
            malformedId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in ConversationService.addParticipants', async () => {
        await expect(
          conversationService.addParticipants(
            validConversationId,
            { userIds: [memberUserId] },
            malformedId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in ConversationService.remove', async () => {
        await expect(
          conversationService.remove(validConversationId, malformedId),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in ConversationService.getMessages', async () => {
        await expect(
          conversationService.getMessages(validConversationId, malformedId),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in ConversationService.markAsSeen', async () => {
        await expect(
          conversationService.markAsSeen(validConversationId, malformedId),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in ConversationService.create', async () => {
        await expect(
          conversationService.create(
            { type: 'direct', participants: [memberUserId] },
            malformedId,
          ),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });

      it('should reject malformed userId in MessageService.revokeMessage', async () => {
        await expect(
          messageService.revokeMessage(validMessageId, malformedId),
        ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      });
    });
  });
});
