import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import {
  Conversation,
  computeSeenBy,
  computeUnreadCounts,
} from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import {
  formatConversation,
  formatLeanConversation,
} from '../src/conversation/conversation.format';
import { groupLookupProviders } from './helpers/group-lookup-mocks';
import { RealtimeService } from '../src/realtime/realtime.service';

describe('ConversationService.getMessages (seq pagination)', () => {
  let service: ConversationService;

  const userId = new Types.ObjectId().toString();
  const conversationId = new Types.ObjectId();

  interface StoredMessage {
    _id: Types.ObjectId;
    conversationId: Types.ObjectId;
    senderId: Types.ObjectId;
    content: string;
    seq: number;
    createdAt: Date;
  }
  let store: StoredMessage[] = [];
  let lastSortSpec: Record<string, 1 | -1> | undefined;

  const seed = (count: number) => {
    // Every message shares one createdAt: order must come from seq alone
    const sameInstant = new Date(Date.UTC(2026, 10, 14, 0, 0, 0));
    store = Array.from({ length: count }, (_, i) => ({
      _id: new Types.ObjectId(),
      conversationId,
      senderId: new Types.ObjectId(userId),
      content: `m${i + 1}`,
      seq: i + 1,
      createdAt: sameInstant,
    }));
  };

  const mockConversationModel = {
    findOne: jest.fn(),
  };

  // Mimics find(query).sort(spec).limit(n).lean() over the in-memory store
  const mockMessageModel = {
    find: jest.fn(
      (query: { conversationId: Types.ObjectId; seq?: { $lt: number } }) => {
        const before = query.seq?.$lt;
        const rows = store
          .filter((m) => m.conversationId.equals(query.conversationId))
          .filter((m) => before === undefined || m.seq < before);
        return {
          sort: (spec: Record<string, 1 | -1>) => {
            lastSortSpec = spec;
            const [[field, dir]] = Object.entries(spec);
            const sorted = [...rows].sort(
              (a, b) =>
                dir *
                ((a[field as keyof StoredMessage] as number) -
                  (b[field as keyof StoredMessage] as number)),
            );
            return {
              limit: (n: number) => ({
                lean: () => Promise.resolve(sorted.slice(0, n)),
              }),
            };
          },
        };
      },
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        {
          provide: getModelToken(Message.name),
          useValue: mockMessageModel,
        },
        ...groupLookupProviders(),
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    jest.clearAllMocks();
    mockConversationModel.findOne.mockResolvedValue({ _id: conversationId });
  });

  const getPage = (limit: number, beforeSeq?: number) =>
    service.getMessages(conversationId.toString(), userId, limit, beforeSeq);

  // Pages like use-messages.loadMore: beforeSeq = seq of the oldest message held
  const pageThroughAll = async (limit: number) => {
    const contents: string[] = [];
    let beforeSeq: number | undefined;
    let pages = 0;
    let hasMore = true;
    while (hasMore && pages < 20) {
      const page = await getPage(limit, beforeSeq);
      contents.unshift(...page.messages.map((m) => String(m.content)));
      beforeSeq = page.messages[0]?.seq;
      hasMore = page.hasMore;
      pages++;
    }
    return { contents, pages };
  };

  it('should return every message exactly once across page boundaries, even with identical createdAt', async () => {
    seed(7);

    const { contents, pages } = await pageThroughAll(3);

    expect(pages).toBe(3);
    expect(contents).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  });

  it('should sort by seq only, never by createdAt', async () => {
    seed(3);

    await getPage(3);

    expect(lastSortSpec).toEqual({ seq: -1 });
    expect(mockMessageModel.find).toHaveBeenCalledWith({ conversationId });
  });

  it('should return the newest page oldest -> newest and drop the extra row', async () => {
    seed(5);

    const page = await getPage(2);

    expect(page.messages.map((m) => m.seq)).toEqual([4, 5]);
    expect(page.hasMore).toBe(true);
  });

  it('should only return messages with seq < beforeSeq', async () => {
    seed(5);

    const page = await getPage(10, 4);

    expect(mockMessageModel.find).toHaveBeenCalledWith({
      conversationId,
      seq: { $lt: 4 },
    });
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(page.hasMore).toBe(false);
  });

  it('should return hasMore false when no older messages remain', async () => {
    seed(3);

    const page = await getPage(3);

    expect(page.messages).toHaveLength(3);
    expect(page.hasMore).toBe(false);
  });

  it.each([0, -1, 1.5])(
    'should reject beforeSeq %p with 400',
    async (beforeSeq) => {
      seed(3);

      await expect(getPage(2, beforeSeq)).rejects.toThrow(BadRequestException);
      expect(mockMessageModel.find).not.toHaveBeenCalled();
    },
  );

  it('should hide history from non-members with 404', async () => {
    seed(3);
    mockConversationModel.findOne.mockResolvedValue(null);

    await expect(getPage(2)).rejects.toThrow(NotFoundException);
    expect(mockMessageModel.find).not.toHaveBeenCalled();
  });
});

describe('ConversationService.markAsSeen (lastReadSeq)', () => {
  let service: ConversationService;
  let emitToUser: jest.Mock;

  const me = new Types.ObjectId();
  const other = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

  const mockConversationModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const leanConversation = (overrides: Record<string, unknown> = {}) => ({
    _id: conversationId,
    lastSeq: 10,
    participants: [
      { userId: me, lastReadSeq: 4 },
      { userId: other, lastReadSeq: 10 },
    ],
    lastMessage: { _id: new Types.ObjectId(), senderId: other, seq: 10 },
    ...overrides,
  });

  // Applies the $max the service sends, like MongoDB would
  const applyUpdate = (readTo: number) => {
    const conv = leanConversation();
    conv.participants[0].lastReadSeq = Math.max(
      conv.participants[0].lastReadSeq,
      readTo,
    );
    // A seenBy stored by an older build is never returned
    return { ...conv, seenBy: [me, other] };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: getModelToken(Message.name), useValue: {} },
        ...groupLookupProviders(),
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    emitToUser = module.get<{ emitToUser: jest.Mock }>(
      RealtimeService,
    ).emitToUser;
    jest.clearAllMocks();
    // The membership read, and the re-read when nothing was raised
    mockConversationModel.findOne.mockReturnValue({
      lean: () => Promise.resolve(leanConversation()),
    });
  });

  const sentReadTo = () => {
    const update = mockConversationModel.findOneAndUpdate.mock.calls[0][1] as {
      $max: Record<string, number>;
    };
    return update.$max['participants.$.lastReadSeq'];
  };

  it('should raise lastReadSeq to upToSeq with $max and return the computed unread count', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(applyUpdate(7));

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      7,
    );

    expect(mockConversationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: conversationId,
        participants: {
          $elemMatch: { userId: me, lastReadSeq: { $not: { $gte: 7 } } },
        },
      },
      { $max: { 'participants.$.lastReadSeq': 7 } },
      { returnDocument: 'after' },
    );
    expect(result).toEqual(
      expect.objectContaining({
        myUnreadCount: 3,
        lastSeq: 10,
        lastReadSeq: 7,
        // Has not read up to the newest message
        seenBy: [],
      }),
    );
  });

  it('should list the caller in seenBy once they read the newest message', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(applyUpdate(10));

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      10,
    );

    // not the sender of that message
    expect(result.seenBy).toEqual([me]);
  });

  it('should not list the caller when a newer message arrived meanwhile', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue({
      ...applyUpdate(10),
      lastSeq: 11,
    });

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      10,
    );

    expect(result).toMatchObject({ seenBy: [], myUnreadCount: 1 });
  });

  it('should clamp upToSeq to lastSeq', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(applyUpdate(10));

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      999,
    );

    expect(sentReadTo()).toBe(10);
    expect(result).toEqual(expect.objectContaining({ myUnreadCount: 0 }));
  });

  it('should read everything when the client sends no upToSeq', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(applyUpdate(10));

    await service.markAsSeen(conversationId.toString(), me.toString());

    expect(sentReadTo()).toBe(10);
  });

  it('should keep lastReadSeq when upToSeq is older (stale request)', async () => {
    // The filter does not match: nothing raised, the current state is read back
    mockConversationModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      2,
    );

    expect(result).toEqual(
      expect.objectContaining({ lastReadSeq: 4, myUnreadCount: 6 }),
    );
  });

  it.each([-1, 2.5])('should reject upToSeq %p with 400', async (upToSeq) => {
    await expect(
      service.markAsSeen(conversationId.toString(), me.toString(), upToSeq),
    ).rejects.toThrow(BadRequestException);
    expect(mockConversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('should not update anything when the caller sent the last message', async () => {
    mockConversationModel.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve(
          leanConversation({ lastMessage: { senderId: me, seq: 10 } }),
        ),
    });

    await service.markAsSeen(conversationId.toString(), me.toString(), 10);

    expect(mockConversationModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('should emit receipt:updated to every member once lastReadSeq was raised', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(applyUpdate(7));

    await service.markAsSeen(conversationId.toString(), me.toString(), 7);

    const receipt = {
      conversationId: conversationId.toString(),
      userId: me.toString(),
      readSeq: 7,
    };
    expect(emitToUser.mock.calls).toEqual([
      [me.toString(), 'receipt:updated', receipt],
      [other.toString(), 'receipt:updated', receipt],
    ]);
  });

  it('should emit nothing when nothing was raised (stale or repeated request)', async () => {
    mockConversationModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      4,
    );

    expect(emitToUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({ lastReadSeq: 4, myUnreadCount: 6 });
  });

  it('should emit only after the write resolved', async () => {
    let resolveWrite!: (value: unknown) => void;
    mockConversationModel.findOneAndUpdate.mockReturnValue(
      new Promise((resolve) => (resolveWrite = resolve)),
    );

    const pending = service.markAsSeen(
      conversationId.toString(),
      me.toString(),
      7,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(emitToUser).not.toHaveBeenCalled();
    resolveWrite(applyUpdate(7));
    await pending;
    expect(emitToUser).toHaveBeenCalledTimes(2);
  });
});

describe('computeUnreadCounts', () => {
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();

  it('should compute lastSeq − lastReadSeq per member', () => {
    expect(
      computeUnreadCounts({
        lastSeq: 9,
        participants: [
          { userId: a, lastReadSeq: 9 },
          { userId: b, lastReadSeq: 5 },
        ],
      }),
    ).toEqual({ [a.toString()]: 0, [b.toString()]: 4 });
  });

  it('should treat a missing lastReadSeq as 0 and a missing lastSeq as 0', () => {
    expect(
      computeUnreadCounts({ lastSeq: 3, participants: [{ userId: a }] }),
    ).toEqual({ [a.toString()]: 3 });
    expect(computeUnreadCounts({ participants: [{ userId: a }] })).toEqual({
      [a.toString()]: 0,
    });
  });

  it('should never return a negative count', () => {
    expect(
      computeUnreadCounts({
        lastSeq: 2,
        participants: [{ userId: a, lastReadSeq: 5 }],
      }),
    ).toEqual({ [a.toString()]: 0 });
  });

  it('should accept populated participants and skip deleted users', () => {
    expect(
      computeUnreadCounts({
        lastSeq: 4,
        participants: [
          { userId: { _id: a }, lastReadSeq: 1 },
          { userId: null, lastReadSeq: 0 },
        ],
      }),
    ).toEqual({ [a.toString()]: 3 });
  });
});

describe('computeSeenBy', () => {
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();
  const sender = new Types.ObjectId();
  const conversation = (reads: [Types.ObjectId, number?][]) => ({
    lastSeq: 5,
    lastMessage: { senderId: sender },
    participants: reads.map(([userId, lastReadSeq]) => ({
      userId,
      lastReadSeq,
    })),
  });

  it('should list the members who read up to the newest message', () => {
    expect(
      computeSeenBy(
        conversation([
          [sender, 5],
          [a, 5],
          [b, 4],
        ]),
      ),
    ).toEqual([a]);
    expect(computeSeenBy(conversation([[sender, 5], [a]]))).toEqual([]);
  });

  it('should be empty without a message', () => {
    const participants = [{ userId: a, lastReadSeq: 0 }];
    expect(computeSeenBy({ lastSeq: 0, participants })).toEqual([]);
    expect(
      computeSeenBy({ lastSeq: 5, lastMessage: null, participants }),
    ).toEqual([]);
    expect(
      computeSeenBy({ lastMessage: { senderId: sender }, participants }),
    ).toEqual([]);
  });

  it('should return populated users as they are and skip deleted ones', () => {
    const user = { _id: a, username: 'an' };
    expect(
      computeSeenBy({
        lastSeq: 5,
        lastMessage: { senderId: { _id: sender } },
        participants: [
          { userId: user, lastReadSeq: 5 },
          { userId: { _id: sender, username: 's' }, lastReadSeq: 5 },
          { userId: null, lastReadSeq: 5 },
        ],
      }),
    ).toEqual([user]);
  });
});

describe('conversation responses: seenBy', () => {
  const user = { _id: new Types.ObjectId(), username: 'an' };
  const stale = { _id: new Types.ObjectId(), username: 'left' };
  const stored = {
    lastSeq: 5,
    lastMessage: { senderId: { _id: new Types.ObjectId() } },
    participants: [{ userId: user, lastReadSeq: 5 }],
    seenBy: [stale],
  };

  it('should be computed, not the stored value (list)', () => {
    expect(formatLeanConversation(stored).seenBy).toEqual([user]);
  });

  it('should be computed, not the stored value (single)', () => {
    const doc = { ...stored, toObject: () => stored };
    expect(
      formatConversation(
        doc as unknown as Parameters<typeof formatConversation>[0],
      ).seenBy,
    ).toEqual([user]);
  });
});

describe('conversation responses: participants[].lastReadSeq', () => {
  const reader = { _id: new Types.ObjectId(), username: 'an' };
  const fresh = { _id: new Types.ObjectId(), username: 'moi' };
  const stored = {
    lastSeq: 5,
    participants: [
      { userId: reader, lastReadSeq: 3, joinedAt: new Date(0) },
      // Older documents may have no lastReadSeq: sent as 0
      { userId: fresh, joinedAt: new Date(0) },
    ],
  };

  it('should carry each member read position (list and single)', () => {
    const doc = { ...stored, toObject: () => stored };
    for (const formatted of [
      formatLeanConversation(stored),
      formatConversation(
        doc as unknown as Parameters<typeof formatConversation>[0],
      ),
    ]) {
      expect(formatted.participants.map((p) => [p._id, p.lastReadSeq])).toEqual(
        [
          [reader._id, 3],
          [fresh._id, 0],
        ],
      );
    }
  });
});
