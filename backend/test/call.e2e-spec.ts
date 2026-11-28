import { ConflictException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import { createClient } from 'redis';
import { CallService } from '../src/call/call.service';
import { CallStateService } from '../src/call/call-state.service';
import { MessageService } from '../src/messages/message.service';
import { Message, MessageSchema } from '../src/messages/schemas/message.schema';
import {
  Conversation,
  ConversationSchema,
} from '../src/conversation/schemas/conversation.schema';
import { Friend, FriendSchema } from '../src/friend/schema/friend.schema';
import { connectTestDatabase } from './helpers/mongo-e2e';

// Short timers so the timeout paths run in real time against real Redis
jest.mock('../src/call/call.constants', () => ({
  ...jest.requireActual('../src/call/call.constants'),
  RING_TIMEOUT_MS: 300,
  REJOIN_GRACE_MS: 300,
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls against a real Redis (state, Lua transitions) and a real replica set (the call message):
 * concurrent accepts / hang-ups have exactly one winner, every call is stored exactly once,
 * busy users get 409, and the ring / rejoin timers end only the call they were set for.
 */
describe('Calls (Real Redis + MongoDB replica set)', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let connection: Connection;
  let conversationModel: Model<Conversation>;
  let messageModel: Model<Message>;
  let friendModel: Model<Friend>;
  let callState: CallStateService;
  let service: CallService;
  let redis: ReturnType<typeof createClient>;
  let messageService: MessageService;

  const realtime = { emitToUser: jest.fn(), emitToSocket: jest.fn() };
  const turn = {
    iceServers: jest.fn().mockResolvedValue([{ urls: ['turn:t'] }]),
  };
  const users = {
    findPublicProfile: jest.fn((id: string) =>
      Promise.resolve({ _id: new Types.ObjectId(id), username: 'u' }),
    ),
  };
  const usedUsers: string[] = [];

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_calls');
    conversationModel = connection.model<Conversation>(
      Conversation.name,
      ConversationSchema,
    );
    messageModel = connection.model<Message>(Message.name, MessageSchema);
    friendModel = connection.model<Friend>(Friend.name, FriendSchema);
    await Promise.all([
      conversationModel.init(),
      messageModel.init(),
      friendModel.init(),
    ]);

    const config = {
      get: (key: string) => (key === 'REDIS_URL' ? REDIS_URL : undefined),
    };
    callState = new CallStateService(config as any);
    await callState.onModuleInit();
    redis = createClient({ url: REDIS_URL });
    await redis.connect();

    messageService = new MessageService(
      messageModel as any,
      conversationModel as any,
      realtime as any,
      {} as any,
      connection,
      {} as any,
    );
    service = new CallService(
      conversationModel as any,
      friendModel as any,
      callState,
      turn as any,
      realtime as any,
      messageService,
      users as any,
    );
  }, 30000);

  afterAll(async () => {
    service?.onModuleDestroy();
    if (redis?.isOpen) {
      const keys = usedUsers.map((id) => `call:user:${id}`);
      if (keys.length) await redis.del(keys);
      await redis.quit();
    }
    await callState?.onModuleDestroy();
    if (!connection) return;
    await connection.dropDatabase();
    await connection.close();
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  // Two friends with a direct conversation
  const pair = async () => {
    const [a, b] = [new Types.ObjectId(), new Types.ObjectId()];
    usedUsers.push(a.toString(), b.toString());
    await friendModel.create({ user: a, friend: b });
    const conversation = await conversationModel.create({
      type: 'direct',
      participants: [{ userId: a }, { userId: b }],
      directKey: [a.toString(), b.toString()].sort().join(':'),
    });
    return {
      caller: a.toString(),
      callee: b.toString(),
      conversationId: conversation._id.toString(),
    };
  };

  const callMessages = (conversationId: string) =>
    messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        type: 'call',
      })
      .sort({ seq: 1 })
      .lean();

  const ringFrom = async (p: Awaited<ReturnType<typeof pair>>) =>
    (
      await service.start(p.caller, {
        conversationId: p.conversationId,
        media: 'audio',
      })
    ).call;

  it('two tabs accepting at once: one wins, the other gets 409', async () => {
    const p = await pair();
    const call = await ringFrom(p);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.accept(p.callee, call.id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'fulfilled') continue;
      expect(r.reason).toBeInstanceOf(ConflictException);
    }
    expect((await callState.get(call.id))?.state).toBe('active');
    await service.end(p.caller, call.id);
  });

  it('busy: the caller cannot start a second call; a third user gets 409 and a missed call is stored', async () => {
    const p = await pair();
    const call = await ringFrom(p);
    await expect(ringFrom(p)).rejects.toThrow(
      'Bạn đang trong một cuộc gọi khác',
    );

    // Someone else calls the callee while it rings
    const other = new Types.ObjectId();
    usedUsers.push(other.toString());
    const calleeId = new Types.ObjectId(p.callee);
    await friendModel.create(
      other < calleeId
        ? { user: other, friend: calleeId }
        : { user: calleeId, friend: other },
    );
    const second = await conversationModel.create({
      type: 'direct',
      participants: [{ userId: other }, { userId: calleeId }],
      directKey: [other.toString(), p.callee].sort().join(':'),
    });
    await expect(
      service.start(other.toString(), {
        conversationId: second._id.toString(),
        media: 'video',
      }),
    ).rejects.toThrow('Người nhận đang bận');
    const [missed] = await callMessages(second._id.toString());
    expect(missed).toMatchObject({
      content: 'Cuộc gọi nhỡ',
      call: { media: 'video', status: 'missed' },
      seq: 1,
    });
    expect(missed.senderId.toString()).toBe(other.toString());
    // The busy attempt did not touch the ringing call
    expect((await callState.get(call.id))?.state).toBe('ringing');
    await service.end(p.caller, call.id);
  });

  it('accept racing a hang-up, 15 times: every call ends and is stored exactly once', async () => {
    const p = await pair();
    for (let i = 0; i < 15; i++) {
      const call = await ringFrom(p);
      await Promise.allSettled([
        service.accept(p.callee, call.id),
        service.end(p.caller, call.id),
        service.end(p.caller, call.id),
      ]);
      // An accept that won leaves an active call for the hang-up retry or a later end
      if (await callState.get(call.id)) await service.end(p.callee, call.id);
      expect(await callState.get(call.id)).toBeNull();
    }
    const stored = await callMessages(p.conversationId);
    expect(stored).toHaveLength(15);
    expect(new Set(stored.map((m) => m.clientMsgId)).size).toBe(15);
    expect(stored.map((m) => m.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    expect(await callState.activeFor(p.caller)).toBeNull();
    expect(await callState.activeFor(p.callee)).toBeNull();
  });

  it('unanswered: missed after the ring timeout, both users free again', async () => {
    const p = await pair();
    const call = await ringFrom(p);
    await wait(600);
    expect(await callState.get(call.id)).toBeNull();
    const [missed] = await callMessages(p.conversationId);
    expect(missed).toMatchObject({
      clientMsgId: call.id,
      call: { status: 'missed' },
    });
    // unread for the callee: the caller sent it
    const conversation = await conversationModel
      .findById(p.conversationId)
      .lean();
    expect(conversation?.lastSeq).toBe(1);
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      p.callee,
      'call:updated',
      expect.objectContaining({ reason: 'missed' }),
    );
    const next = await ringFrom(p);
    await service.end(p.caller, next.id);
  });

  it('an accepted call outlives the ring timeout; a socket back in the grace window keeps it', async () => {
    const p = await pair();
    const call = await ringFrom(p);
    await service.accept(p.callee, call.id);
    await service.join(p.caller, call.id, 'caller-1');
    const joined = await service.join(p.callee, call.id, 'callee-1');
    expect(joined).toMatchObject({
      ok: true,
      role: 'callee',
      peerSocket: 'caller-1',
    });
    await wait(400);
    expect((await callState.get(call.id))?.state).toBe('active');

    // The caller reloads: old socket gone, new one joins in time
    service.socketLeft(call.id, 'caller', 'caller-1');
    await wait(100);
    expect(await service.join(p.caller, call.id, 'caller-2')).toMatchObject({
      ok: true,
      previousSocket: 'caller-1',
    });
    await wait(400);
    expect((await callState.get(call.id))?.callerSocket).toBe('caller-2');
    expect(await service.signalTarget(call.id, 'caller', 'caller-1')).toEqual({
      ok: false,
      code: 'NOT_JOINED',
    });
    expect(await service.signalTarget(call.id, 'callee', 'callee-1')).toEqual({
      ok: true,
      peerSocket: 'caller-2',
    });

    // The callee's socket goes and does not come back: dropped, stored as completed
    service.socketLeft(call.id, 'callee', 'callee-1');
    await wait(600);
    expect(await callState.get(call.id)).toBeNull();
    const [done] = await callMessages(p.conversationId);
    expect(done.call).toMatchObject({ media: 'audio', status: 'completed' });
    expect(done.content).toMatch(/^Cuộc gọi thoại · 0:0\d$/);
  });

  it('accepted on another instance: the ring timer here does not end it', async () => {
    const other = new CallService(
      conversationModel as any,
      friendModel as any,
      callState,
      turn as any,
      realtime as any,
      {} as any,
      users as any,
    );
    const p = await pair();
    const call = await ringFrom(p);
    await other.accept(p.callee, call.id);
    await wait(500);
    expect((await callState.get(call.id))?.state).toBe('active');
    expect(await callMessages(p.conversationId)).toHaveLength(0);
    await service.end(p.caller, call.id);
    expect(await callMessages(p.conversationId)).toHaveLength(1);
    other.onModuleDestroy();
  });

  it('the callee cannot join before answering; a stale lock does not block a new call', async () => {
    const p = await pair();
    const call = await ringFrom(p);
    expect(await service.join(p.callee, call.id, 's')).toEqual({
      ok: false,
      code: 'NOT_ACCEPTED',
    });
    expect(
      await service.join(new Types.ObjectId().toString(), call.id, 's'),
    ).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    await service.end(p.caller, call.id);

    // A lock left behind by a call whose hash expired
    await redis.set(`call:user:${p.callee}`, 'gone-call', { EX: 60 });
    const next = await ringFrom(p);
    expect(next.state).toBe('ringing');
    await service.end(p.callee, next.id);
    // Call records cannot be revoked
    const [first] = await callMessages(p.conversationId);
    await expect(
      messageService.revokeMessage(first._id.toString(), p.caller),
    ).rejects.toThrow('Không thể thu hồi tin cuộc gọi');
    const statuses = (await callMessages(p.conversationId)).map(
      (m) => m.call?.status,
    );
    expect(statuses).toEqual(['missed', 'declined']);
  });
});
