import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { RealtimeService } from '../src/realtime/realtime.service';
import {
  allowAllGroupLookups,
  groupLookupProviders,
  stubGroupChangeWrites,
} from './helpers/group-lookup-mocks';

interface StoredParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadSeq: number;
}

describe('ConversationService group membership (leave / remove / transfer)', () => {
  let service: ConversationService;
  let lookups: ReturnType<typeof allowAllGroupLookups>;

  const ownerId = new Types.ObjectId();
  const memberId = new Types.ObjectId();
  const otherId = new Types.ObjectId();
  const outsiderId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const owner = ownerId.toString();
  const member = memberId.toString();
  const groupId = conversationId.toString();

  const names: Record<string, string> = {
    [owner]: 'An',
    [member]: 'Bình',
    [otherId.toString()]: 'Chi',
  };

  const mockConversationModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  const mockMessageModel = { create: jest.fn(), deleteMany: jest.fn() };
  const mockRealtime = { emitToUser: jest.fn() };
  const mockConnection = {
    transaction: jest.fn((fn: (session: object) => unknown) => fn({})),
  };

  // A group document as Mongoose returns it (participants hold raw ids)
  const makeGroup = (members: Types.ObjectId[], createdBy = ownerId) => {
    const participants: StoredParticipant[] = members.map((userId) => ({
      userId,
      joinedAt: new Date(),
      lastReadSeq: 3,
    }));
    return {
      _id: conversationId,
      type: 'group',
      group: { name: 'Nhóm', createdBy },
      participants,
      lastSeq: 3,
      lastMessageAt: new Date(),
      populate: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({
        _id: conversationId,
        type: 'group',
        group: { name: 'Nhóm', createdBy },
        lastMessage: { seq: 4 },
      }),
    };
  };

  const firstWrite = () =>
    mockConversationModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, any>,
    ];
  const systemMessage = () =>
    (mockMessageModel.create.mock.calls[0] as [[Record<string, any>]])[0][0];
  const emitted = (event: string) =>
    mockRealtime.emitToUser.mock.calls
      .filter(([, name]) => name === event)
      .map(([userId]) => userId as string);

  beforeEach(async () => {
    lookups = allowAllGroupLookups();
    // Display names for the system message text
    lookups.userModel.find.mockImplementation(
      (filter: { _id: { $in: Types.ObjectId[] } }) => ({
        lean: jest.fn().mockResolvedValue(
          filter._id.$in.map((id) => ({
            _id: id,
            displayName: names[id.toString()],
            username: 'u',
          })),
        ),
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        ...groupLookupProviders(lookups),
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    jest.clearAllMocks();
    mockConversationModel.findOneAndUpdate.mockReset();
  });

  describe('leaveGroup', () => {
    it('removes a member, records member_left and tells the right people', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId, otherId]),
      );
      const stored = makeGroup([ownerId, otherId]);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, stored, 4);

      const result = await service.leaveGroup(groupId, member);

      expect(result).toEqual({
        message: 'Đã rời nhóm',
        conversationId: groupId,
      });
      const [filter, update] = firstWrite();
      // Still a member and not owner at write time
      expect(filter).toMatchObject({
        _id: conversationId,
        type: 'group',
        'participants.userId': memberId,
        'group.createdBy': { $ne: memberId },
      });
      expect(update).toEqual({
        $pull: { participants: { userId: memberId }, seenBy: memberId },
        $inc: { lastSeq: 1 },
      });
      expect(systemMessage()).toMatchObject({
        senderId: memberId,
        type: 'system',
        seq: 4,
        system: { action: 'member_left', targetIds: [] },
        content: 'Bình đã rời nhóm',
      });
      // Remaining members (from the stored conversation) get the update and the message
      expect(emitted('conversation:updated')).toEqual([
        owner,
        otherId.toString(),
      ]);
      expect(emitted('message:new')).toEqual([owner, otherId.toString()]);
      expect(emitted('conversation:removed')).toEqual([member]);
    });

    it('refuses an owner who still has members (must transfer first)', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );

      await expect(service.leaveGroup(groupId, owner)).rejects.toThrow(
        new BadRequestException(
          'Hãy chuyển quyền trưởng nhóm cho thành viên khác trước khi rời nhóm',
        ),
      );
      expect(mockConnection.transaction).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });

    it('deletes the group when the owner is the last member', async () => {
      mockConversationModel.findOne.mockResolvedValue(makeGroup([ownerId]));
      mockConversationModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.leaveGroup(groupId, owner);

      expect(mockConversationModel.deleteOne).toHaveBeenCalledWith({
        _id: conversationId,
        'group.createdBy': ownerId,
        participants: { $size: 1 },
      });
      expect(mockMessageModel.deleteMany).toHaveBeenCalledWith({
        conversationId,
      });
      expect(emitted('conversation:removed')).toEqual([owner]);
    });

    it('returns 409 and deletes nothing if someone joined the group meanwhile', async () => {
      mockConversationModel.findOne.mockResolvedValue(makeGroup([ownerId]));
      mockConversationModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await expect(service.leaveGroup(groupId, owner)).rejects.toThrow(
        ConflictException,
      );
      expect(mockMessageModel.deleteMany).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });

    it('returns 404 for a non-member, a direct conversation or a missing group', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      await expect(
        service.leaveGroup(groupId, outsiderId.toString()),
      ).rejects.toThrow(NotFoundException);
      expect(mockConversationModel.findOne).toHaveBeenCalledWith({
        _id: conversationId,
        type: 'group',
        'participants.userId': outsiderId,
      });
    });
  });

  describe('removeParticipant', () => {
    it('lets the owner remove a member and records member_removed', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId, otherId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId, otherId]),
        4,
      );

      await service.removeParticipant(groupId, member, owner);

      const [filter, update] = firstWrite();
      expect(filter).toMatchObject({
        'group.createdBy': ownerId,
        'participants.userId': memberId,
      });
      expect(update.$pull).toEqual({
        participants: { userId: memberId },
        seenBy: memberId,
      });
      expect(systemMessage()).toMatchObject({
        senderId: ownerId,
        system: { action: 'member_removed', targetIds: [memberId] },
        content: 'An đã xóa Bình khỏi nhóm',
      });
      // The removed member is told to drop the group and gets no message
      expect(emitted('conversation:removed')).toEqual([member]);
      expect(emitted('message:new')).not.toContain(member);
    });

    it('forbids a non-owner', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId, otherId]),
      );

      await expect(
        service.removeParticipant(groupId, otherId.toString(), member),
      ).rejects.toThrow(
        new ForbiddenException('Chỉ trưởng nhóm mới có quyền xóa thành viên'),
      );
      expect(mockConnection.transaction).not.toHaveBeenCalled();
    });

    it('refuses the owner removing themself and a user who is not a member', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );

      await expect(
        service.removeParticipant(groupId, owner, owner),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.removeParticipant(groupId, outsiderId.toString(), owner),
      ).rejects.toThrow(
        new NotFoundException('Người này không còn trong nhóm'),
      );
      await expect(
        service.removeParticipant(groupId, 'not-an-id', owner),
      ).rejects.toThrow(new BadRequestException('User ID không hợp lệ'));
      expect(mockConnection.transaction).not.toHaveBeenCalled();
    });

    it('returns 409, stores nothing and emits nothing when the member left meanwhile', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      // The conditional write matches nothing
      mockConversationModel.findOneAndUpdate.mockResolvedValueOnce(null);

      await expect(
        service.removeParticipant(groupId, member, owner),
      ).rejects.toThrow(
        new ConflictException('Nhóm vừa thay đổi, hãy thử lại'),
      );
      expect(mockMessageModel.create).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    it('moves group.createdBy to a member and records owner_transferred', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      const stored = makeGroup([ownerId, memberId], memberId);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, stored, 4);

      const result = await service.transferOwnership(
        groupId,
        { userId: member },
        owner,
      );

      const [filter, update] = firstWrite();
      expect(filter).toMatchObject({
        'group.createdBy': ownerId,
        'participants.userId': memberId,
      });
      expect(update.$set).toEqual({ 'group.createdBy': memberId });
      expect(systemMessage()).toMatchObject({
        system: { action: 'owner_transferred', targetIds: [memberId] },
        content: 'An đã chuyển quyền trưởng nhóm cho Bình',
      });
      expect(result.group?.createdBy).toEqual(memberId);
      expect(emitted('conversation:updated')).toEqual([owner, member]);
      expect(emitted('conversation:removed')).toEqual([]);
    });

    it('rejects a non-owner, the owner themself and a non-member', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );

      await expect(
        service.transferOwnership(groupId, { userId: owner }, member),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.transferOwnership(groupId, { userId: owner }, owner),
      ).rejects.toThrow(new BadRequestException('Bạn đã là trưởng nhóm'));
      await expect(
        service.transferOwnership(
          groupId,
          { userId: outsiderId.toString() },
          owner,
        ),
      ).rejects.toThrow(
        new BadRequestException('Người nhận quyền phải là thành viên của nhóm'),
      );
      expect(mockConnection.transaction).not.toHaveBeenCalled();
    });
  });

  describe('system message + lastMessage write', () => {
    it('sets lastMessage to the system message and marks it read for the actor only', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      stubGroupChangeWrites(
        mockConversationModel,
        mockMessageModel,
        makeGroup([ownerId, memberId]),
        9,
      );

      await service.update(groupId, { groupName: 'Tên mới' }, owner);

      expect(systemMessage()).toMatchObject({
        seq: 9,
        system: { action: 'group_renamed' },
        content: 'An đã đổi tên nhóm thành "Tên mới"',
      });
      const [filter, update, options] = mockConversationModel.findOneAndUpdate
        .mock.calls[1] as [
        Record<string, unknown>,
        Record<string, any>,
        { arrayFilters: unknown[]; session: unknown },
      ];
      expect(filter).toEqual({ _id: conversationId });
      expect(update.$set.lastMessage).toMatchObject({
        senderId: ownerId,
        seq: 9,
        content: 'An đã đổi tên nhóm thành "Tên mới"',
      });
      expect(update.$max).toEqual({ 'participants.$[me].lastReadSeq': 9 });
      expect(options.arrayFilters).toEqual([{ 'me.userId': ownerId }]);
      expect(options.session).toBeDefined();
    });

    it('does nothing when the name is unchanged', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );

      await service.update(groupId, { groupName: '  Nhóm ' }, owner);

      expect(mockConnection.transaction).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });

    it('sends message:new with type system and the computed unread counts', async () => {
      mockConversationModel.findOne.mockResolvedValue(
        makeGroup([ownerId, memberId]),
      );
      const stored = makeGroup([ownerId, memberId]);
      stored.lastSeq = 4;
      stored.participants[0].lastReadSeq = 4;
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, stored, 4);

      await service.transferOwnership(groupId, { userId: member }, owner);

      const [, , payload] = mockRealtime.emitToUser.mock.calls.find(
        ([userId, event]) => userId === member && event === 'message:new',
      ) as [string, string, Record<string, any>];
      expect(payload.message).toMatchObject({
        type: 'system',
        seq: 4,
        senderId: owner,
        system: { action: 'owner_transferred', targetIds: [member] },
      });
      expect(payload.conversation).toMatchObject({
        _id: groupId,
        lastSeq: 4,
        unreadCounts: { [owner]: 0, [member]: 1 },
      });
    });
  });
});
