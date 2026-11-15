import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import { ConversationGroupService } from '../src/conversation/conversation-group.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { RealtimeService } from '../src/realtime/realtime.service';
import { NotificationService } from '../src/notification/notification.service';
import {
  groupLookupProviders,
  stubGroupChangeWrites,
} from './helpers/group-lookup-mocks';

// Stored notifications and live events for group creation and group changes
describe('Group notifications', () => {
  let service: ConversationService;
  let groupService: ConversationGroupService;

  const ownerId = new Types.ObjectId();
  const memberId = new Types.ObjectId();
  const otherId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const owner = ownerId.toString();
  const groupId = conversationId.toString();

  const mockConversationModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const mockMessageModel = { create: jest.fn() };
  const mockRealtime = { emitToUser: jest.fn() };
  const mockNotification = {
    notify: jest.fn(),
    removeFriendRequestNotifications: jest.fn(),
  };

  const makeGroup = (members: Types.ObjectId[], name = 'Nhóm') => ({
    _id: conversationId,
    type: 'group',
    group: { name, createdBy: ownerId },
    participants: members.map((userId) => ({
      userId,
      joinedAt: new Date(),
      lastReadSeq: 3,
    })),
    lastSeq: 3,
    lastMessageAt: new Date(),
    populate: jest.fn().mockResolvedValue(undefined),
    toObject: () => ({ _id: conversationId, type: 'group', lastMessage: {} }),
  });

  const emittedTo = (event: string) =>
    mockRealtime.emitToUser.mock.calls
      .filter(([, name]) => name === event)
      .map(([userId]) => userId as string);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        ...groupLookupProviders(),
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: NotificationService, useValue: mockNotification },
      ],
    }).compile();

    service = module.get(ConversationService);
    groupService = module.get(ConversationGroupService);
    jest.clearAllMocks();
    mockConversationModel.findOneAndUpdate.mockReset();
  });

  describe('create group', () => {
    beforeEach(() => {
      mockConversationModel.create.mockImplementation(
        (data: { group: { name: string } }) =>
          Promise.resolve({
            ...data,
            _id: conversationId,
            populate: jest.fn().mockResolvedValue(undefined),
            toObject: () => ({ _id: conversationId, type: 'group' }),
          }),
      );
    });

    it('sends conversation:updated to every member, then notifies the invited users', async () => {
      await service.create(
        {
          type: 'group',
          participants: [memberId.toString(), otherId.toString()],
          groupName: '  Nhóm mới ',
        },
        owner,
      );

      expect(emittedTo('conversation:updated')).toEqual([
        owner,
        memberId.toString(),
        otherId.toString(),
      ]);
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);
      expect(mockNotification.notify).toHaveBeenCalledWith(
        [memberId, otherId],
        {
          type: 'group_added',
          actorId: ownerId,
          conversationId,
          groupName: 'Nhóm mới',
        },
      );
      // The group is in the members' lists before the notification arrives
      expect(
        mockRealtime.emitToUser.mock.invocationCallOrder.at(-1),
      ).toBeLessThan(mockNotification.notify.mock.invocationCallOrder[0]);
    });

    it('stores nothing and notifies no one when the group is rejected', async () => {
      await expect(
        service.create(
          {
            type: 'group',
            participants: [memberId.toString()],
            groupName: '   ',
          },
          owner,
        ),
      ).rejects.toThrow();

      expect(mockConversationModel.create).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
      expect(mockNotification.notify).not.toHaveBeenCalled();
    });
  });

  describe('group changes', () => {
    it('add members: group_added to the added users only, after the change is emitted', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId, memberId, otherId]),
        4,
      );

      await groupService.addParticipants(
        groupId,
        // memberId is already in the group: skipped
        { userIds: [memberId.toString(), otherId.toString()] },
        owner,
      );

      expect(mockNotification.notify).toHaveBeenCalledWith([otherId], {
        type: 'group_added',
        actorId: ownerId,
        conversationId,
        groupName: 'Nhóm',
      });
      expect(
        mockRealtime.emitToUser.mock.invocationCallOrder.at(-1),
      ).toBeLessThan(mockNotification.notify.mock.invocationCallOrder[0]);
    });

    it('remove member: group_removed to the removed member', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId]),
        4,
      );

      await groupService.removeParticipant(groupId, memberId.toString(), owner);

      expect(mockNotification.notify).toHaveBeenCalledWith([memberId], {
        type: 'group_removed',
        actorId: ownerId,
        conversationId,
        groupName: 'Nhóm',
      });
    });

    it('transfer ownership: group_owner to the new owner', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId, memberId]),
        4,
      );

      await groupService.transferOwnership(
        groupId,
        { userId: memberId.toString() },
        owner,
      );

      expect(mockNotification.notify).toHaveBeenCalledWith([memberId], {
        type: 'group_owner',
        actorId: ownerId,
        conversationId,
        groupName: 'Nhóm',
      });
    });

    it('leave and rename: no notification', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId]),
        4,
      );
      await groupService.leaveGroup(groupId, memberId.toString());

      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId, memberId], 'Tên mới'),
        5,
      );
      await groupService.update(groupId, { groupName: 'Tên mới' }, owner);

      expect(mockNotification.notify).not.toHaveBeenCalled();
    });

    it('a change that loses a race (409) notifies no one', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      mockConversationModel.findOneAndUpdate.mockResolvedValueOnce(null);

      await expect(
        groupService.removeParticipant(groupId, memberId.toString(), owner),
      ).rejects.toThrow(ConflictException);
      expect(mockNotification.notify).not.toHaveBeenCalled();
    });
  });
});
