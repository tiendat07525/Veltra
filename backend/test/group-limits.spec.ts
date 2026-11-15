import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ConversationService,
  MAX_GROUP_MEMBERS,
} from '../src/conversation/conversation.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import {
  allowAllGroupLookups,
  groupLookupProviders,
  stubGroupChangeWrites,
} from './helpers/group-lookup-mocks';

interface StoredParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
}

describe('ConversationService group membership limits', () => {
  let service: ConversationService;
  let lookups: ReturnType<typeof allowAllGroupLookups>;

  const ownerId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const newIds = (count: number) =>
    Array.from({ length: count }, () => new Types.ObjectId().toString());

  const mockConversationModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const mockMessageModel = { create: jest.fn() };

  // Update document of the n-th findOneAndUpdate call (0 = the membership change)
  const writeCall = (n: number) =>
    mockConversationModel.findOneAndUpdate.mock.calls[n] as [
      Record<string, unknown>,
      Record<string, any>,
      { arrayFilters?: Record<string, unknown>[] },
    ];
  const pushedIds = () =>
    (writeCall(0)[1].$push.participants.$each as StoredParticipant[]).map((p) =>
      p.userId.toString(),
    );

  // Group document holding `memberCount` members, the owner first
  const makeGroupDocument = (memberCount: number) => {
    const participants: StoredParticipant[] = [
      { userId: ownerId, joinedAt: new Date() },
      ...newIds(memberCount - 1).map((id) => ({
        userId: new Types.ObjectId(id),
        joinedAt: new Date(),
      })),
    ];
    return {
      _id: conversationId,
      type: 'group',
      group: { name: 'G', createdBy: ownerId },
      participants,
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: conversationId, type: 'group' }),
    };
  };

  beforeEach(async () => {
    lookups = allowAllGroupLookups();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        ...groupLookupProviders(lookups),
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    jest.clearAllMocks();
    mockConversationModel.create.mockImplementation(
      (data: { participants: StoredParticipant[] }) =>
        Promise.resolve({
          ...data,
          populate: jest.fn().mockResolvedValue(undefined),
          toObject: () => ({ type: 'group' }),
        }),
    );
  });

  const createGroup = (participants: string[]) =>
    service.create(
      { type: 'group', participants, groupName: 'Nhóm' },
      ownerId.toString(),
    );

  describe('create group', () => {
    it('should create a group of friends, dropping duplicates and the creator', async () => {
      const [a, b] = newIds(2);

      await createGroup([a, b, a, ownerId.toString()]);

      const created = mockConversationModel.create.mock.calls[0][0] as {
        participants: StoredParticipant[];
      };
      expect(created.participants.map((p) => p.userId.toString())).toEqual([
        ownerId.toString(),
        a,
        b,
      ]);
      // Only invited users are looked up, never the creator
      const userFilter = lookups.userModel.countDocuments.mock.calls[0][0];
      expect(userFilter._id.$in.map(String)).toEqual([a, b]);
    });

    it('should normalize friend pairs (smaller id stored in `user`)', async () => {
      const [a] = newIds(1);

      await createGroup([a]);

      const [pair] = lookups.friendModel.countDocuments.mock.calls[0][0]
        .$or as { user: Types.ObjectId; friend: Types.ObjectId }[];
      expect(pair.user.toString() < pair.friend.toString()).toBe(true);
      expect([pair.user.toString(), pair.friend.toString()].sort()).toEqual(
        [ownerId.toString(), a].sort(),
      );
    });

    it('should reject a user that does not exist', async () => {
      lookups.userModel.countDocuments.mockResolvedValueOnce(1);

      await expect(createGroup(newIds(2))).rejects.toThrow(
        new BadRequestException('Người dùng không tồn tại'),
      );
      expect(mockConversationModel.create).not.toHaveBeenCalled();
    });

    it('should reject a user who is not a friend of the creator', async () => {
      lookups.friendModel.countDocuments.mockResolvedValueOnce(1);

      await expect(createGroup(newIds(2))).rejects.toThrow(
        new BadRequestException('Chỉ có thể thêm bạn bè vào nhóm'),
      );
      expect(mockConversationModel.create).not.toHaveBeenCalled();
    });

    it(`should allow exactly ${MAX_GROUP_MEMBERS} members including the creator`, async () => {
      await createGroup(newIds(MAX_GROUP_MEMBERS - 1));

      expect(mockConversationModel.create).toHaveBeenCalled();
    });

    it(`should reject more than ${MAX_GROUP_MEMBERS} members before any lookup`, async () => {
      await expect(createGroup(newIds(MAX_GROUP_MEMBERS))).rejects.toThrow(
        new BadRequestException(`Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`),
      );
      expect(lookups.userModel.countDocuments).not.toHaveBeenCalled();
      expect(mockConversationModel.create).not.toHaveBeenCalled();
    });
  });

  describe('addParticipants', () => {
    const add = (userIds: string[]) =>
      service.addParticipants(
        conversationId.toString(),
        { userIds },
        ownerId.toString(),
      );

    it('should only check and add users who are not members yet', async () => {
      const doc = makeGroupDocument(3);
      mockConversationModel.findOne.mockResolvedValue(doc);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, doc);
      const existing = doc.participants[1].userId.toString();
      const [fresh] = newIds(1);

      await add([existing, fresh, fresh]);

      const userFilter = lookups.userModel.countDocuments.mock.calls[0][0];
      expect(userFilter._id.$in.map(String)).toEqual([fresh]);
      expect(pushedIds()).toEqual([fresh]);
      // Written only if none of them joined in the meantime and the caller is still owner
      expect(writeCall(0)[0]).toMatchObject({
        'group.createdBy': ownerId,
        'participants.userId': { $nin: [new Types.ObjectId(fresh)] },
      });
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should start new members at lastReadSeq = seq − 1 so only the system message is unread', async () => {
      const doc = makeGroupDocument(2);
      mockConversationModel.findOne.mockResolvedValue(doc);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, doc, 13);
      const [fresh] = newIds(1);

      await add([fresh]);

      expect(
        (
          writeCall(0)[1].$push.participants.$each as { lastReadSeq: number }[]
        )[0].lastReadSeq,
      ).toBe(0);
      const [, lastMessageUpdate, options] = writeCall(1);
      expect(lastMessageUpdate.$max).toEqual({
        'participants.$[me].lastReadSeq': 13,
        'participants.$[added].lastReadSeq': 12,
      });
      expect(options.arrayFilters).toEqual([
        { 'me.userId': ownerId },
        { 'added.userId': { $in: [new Types.ObjectId(fresh)] } },
      ]);
    });

    it('should record a members_added system message naming the new members', async () => {
      const doc = makeGroupDocument(2);
      mockConversationModel.findOne.mockResolvedValue(doc);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, doc, 4);
      const added = newIds(5);

      await add(added);

      const [[systemMessage]] = mockMessageModel.create.mock.calls[0] as [
        [Record<string, any>],
      ];
      expect(systemMessage).toMatchObject({
        senderId: ownerId,
        type: 'system',
        seq: 4,
        system: { action: 'members_added' },
      });
      expect(systemMessage.system.targetIds.map(String)).toEqual(added);
      // Names not found in the mock → "Người dùng"; more than 3 are summarized
      expect(systemMessage.content).toBe(
        'Người dùng đã thêm Người dùng, Người dùng, Người dùng và 2 người khác vào nhóm',
      );
    });

    it('should skip lookups when every user is already a member', async () => {
      const doc = makeGroupDocument(2);
      mockConversationModel.findOne.mockResolvedValue(doc);

      await add([doc.participants[1].userId.toString()]);

      expect(lookups.userModel.countDocuments).not.toHaveBeenCalled();
      expect(doc.participants).toHaveLength(2);
    });

    it('should reject a new member who is not a friend of the group owner', async () => {
      const doc = makeGroupDocument(2);
      mockConversationModel.findOne.mockResolvedValue(doc);
      lookups.friendModel.countDocuments.mockResolvedValueOnce(0);

      await expect(add(newIds(1))).rejects.toThrow(
        new BadRequestException('Chỉ có thể thêm bạn bè vào nhóm'),
      );
      expect(doc.save).not.toHaveBeenCalled();
      expect(doc.participants).toHaveLength(2);
    });

    it('should reject a new member that does not exist', async () => {
      const doc = makeGroupDocument(2);
      mockConversationModel.findOne.mockResolvedValue(doc);
      lookups.userModel.countDocuments.mockResolvedValueOnce(0);

      await expect(add(newIds(1))).rejects.toThrow(
        new BadRequestException('Người dùng không tồn tại'),
      );
      expect(doc.save).not.toHaveBeenCalled();
    });

    it(`should fill a group up to ${MAX_GROUP_MEMBERS} members, re-checking the cap in the write`, async () => {
      const doc = makeGroupDocument(MAX_GROUP_MEMBERS - 2);
      mockConversationModel.findOne.mockResolvedValue(doc);
      stubGroupChangeWrites(mockConversationModel, mockMessageModel, doc);

      await add(newIds(2));

      expect(pushedIds()).toHaveLength(2);
      // A concurrent add that filled the group makes the write match nothing
      expect(writeCall(0)[0]).toMatchObject({
        [`participants.${MAX_GROUP_MEMBERS - 2}`]: { $exists: false },
      });
    });

    it(`should reject adding beyond ${MAX_GROUP_MEMBERS} members`, async () => {
      const doc = makeGroupDocument(MAX_GROUP_MEMBERS);
      mockConversationModel.findOne.mockResolvedValue(doc);

      await expect(add(newIds(1))).rejects.toThrow(
        new BadRequestException(`Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`),
      );
      expect(lookups.userModel.countDocuments).not.toHaveBeenCalled();
      expect(doc.save).not.toHaveBeenCalled();
    });
  });
});
