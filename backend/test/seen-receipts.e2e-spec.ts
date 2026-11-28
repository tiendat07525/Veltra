import { NotFoundException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import {
  Conversation,
  ConversationSchema,
} from '../src/conversation/schemas/conversation.schema';
import { connectTestDatabase } from './helpers/mongo-e2e';

/**
 * "Đã xem" against a real replica set: concurrent marks end at the highest one, lastReadSeq never
 * goes back, and receipt:updated is emitted once per real rise (never for stale / repeated marks).
 */
describe('Seen receipts (Real MongoDB replica set)', () => {
  let connection: Connection;
  let conversationModel: Model<Conversation>;
  let service: ConversationService;

  const realtime = { emitToUser: jest.fn() };

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_seen_receipts');
    conversationModel = connection.model<Conversation>(
      Conversation.name,
      ConversationSchema,
    );
    await conversationModel.init();
    // markAsSeen only uses the conversation model and the realtime service
    service = new ConversationService(
      conversationModel as any,
      {} as any,
      {} as any,
      realtime as any,
      {} as any,
      {} as any,
    );
  }, 30000);

  afterAll(async () => {
    if (!connection) return;
    await connection.dropDatabase();
    await connection.close();
  }, 30000);

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => conversationModel.deleteMany({}));

  // A group of `members` at lastSeq, the newest message sent by the first member
  const setup = async (
    members: Types.ObjectId[],
    lastSeq: number,
    readSeq: (i: number) => number | undefined = () => 0,
  ) => {
    const conversation = await conversationModel.create({
      type: 'group',
      group: { name: 'Nhóm', createdBy: members[0] },
      participants: members.map((userId, i) => ({
        userId,
        joinedAt: new Date(),
        lastReadSeq: readSeq(i),
      })),
      lastSeq,
      lastMessage: {
        _id: new Types.ObjectId(),
        content: 'x',
        senderId: members[0],
        createdAt: new Date(),
        seq: lastSeq,
      },
      lastMessageAt: new Date(),
    });
    return conversation._id.toString();
  };

  const readSeqOf = async (conversationId: string, userId: Types.ObjectId) => {
    const stored = await conversationModel
      .findById(conversationId)
      .lean()
      .orFail();
    return stored.participants.find((p) => p.userId.equals(userId))!
      .lastReadSeq;
  };

  const receiptsFor = (to: string) =>
    realtime.emitToUser.mock.calls
      .filter(([user, event]) => user === to && event === 'receipt:updated')
      .map(([, , payload]) => payload as { userId: string; readSeq: number });

  it('concurrent marks of one member end at the highest; one receipt per real rise', async () => {
    const [sender, me] = [new Types.ObjectId(), new Types.ObjectId()];
    const conversationId = await setup([sender, me], 40);

    // 40 marks in any order, plus repeats
    const seqs = [...Array.from({ length: 40 }, (_, i) => 40 - i), 20, 40, 1];
    await Promise.all(
      seqs.map((seq) => service.markAsSeen(conversationId, me.toString(), seq)),
    );

    expect(await readSeqOf(conversationId, me)).toBe(40);
    const received = receiptsFor(sender.toString()).map((r) => r.readSeq);
    // Every receipt is a distinct real rise and 40 is among them. Emits may reach the event loop
    // out of order, which is why clients keep the highest readSeq.
    expect(received.length).toBeGreaterThan(0);
    expect(new Set(received).size).toBe(received.length);
    expect(Math.max(...received)).toBe(40);
    // My other tabs get the same receipts
    expect(receiptsFor(me.toString())).toEqual(receiptsFor(sender.toString()));
  });

  it('20 members marking at once: each emits to all 20, and nothing more', async () => {
    const members = Array.from({ length: 20 }, () => new Types.ObjectId());
    const conversationId = await setup(members, 9);

    await Promise.all(
      members
        .slice(1)
        .map((u) => service.markAsSeen(conversationId, u.toString(), 9)),
    );
    // Same marks again: nothing to raise
    await Promise.all(
      members
        .slice(1)
        .map((u) => service.markAsSeen(conversationId, u.toString(), 9)),
    );

    for (const u of members.slice(1)) {
      expect(await readSeqOf(conversationId, u)).toBe(9);
    }
    expect(realtime.emitToUser).toHaveBeenCalledTimes(19 * 20);
    const toSender = receiptsFor(members[0].toString());
    expect(new Set(toSender.map((r) => r.userId)).size).toBe(19);
    expect(toSender.every((r) => r.readSeq === 9)).toBe(true);
  });

  it('a stale mark keeps lastReadSeq and emits nothing; a missing lastReadSeq counts as 0', async () => {
    const [sender, me, legacy] = [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ];
    const conversationId = await setup([sender, me, legacy], 10, (i) =>
      i === 1 ? 8 : 0,
    );
    // An older document without the field
    await conversationModel.updateOne(
      { _id: conversationId, 'participants.userId': legacy },
      { $unset: { 'participants.$.lastReadSeq': 1 } },
    );

    const stale = await service.markAsSeen(conversationId, me.toString(), 5);
    expect(stale).toMatchObject({ lastReadSeq: 8, myUnreadCount: 2 });
    expect(realtime.emitToUser).not.toHaveBeenCalled();

    await service.markAsSeen(conversationId, legacy.toString(), 3);
    expect(await readSeqOf(conversationId, legacy)).toBe(3);
    expect(receiptsFor(sender.toString())).toEqual([
      { conversationId, userId: legacy.toString(), readSeq: 3 },
    ]);
  });

  it('a non-member gets 404 and nothing is emitted', async () => {
    const [sender, me] = [new Types.ObjectId(), new Types.ObjectId()];
    const conversationId = await setup([sender, me], 3);
    await expect(
      service.markAsSeen(conversationId, new Types.ObjectId().toString(), 3),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
});
