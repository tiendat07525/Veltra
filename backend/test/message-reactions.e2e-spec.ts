import { BadRequestException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import { MessageService } from '../src/messages/message.service';
import { ConversationService } from '../src/conversation/conversation.service';
import {
  Message,
  MessageSchema,
  REACTION_EMOJIS,
} from '../src/messages/schemas/message.schema';
import {
  Conversation,
  ConversationSchema,
} from '../src/conversation/schemas/conversation.schema';
import { connectTestDatabase } from './helpers/mongo-e2e';

/**
 * Reactions against a real replica set: the pipeline update keeps one reaction per user
 * under concurrency, reactionsVersion goes up once per change, and a revoke racing
 * reactions leaves none behind.
 */
describe('Message reactions (Real MongoDB replica set)', () => {
  let connection: Connection;
  let conversationModel: Model<Conversation>;
  let messageModel: Model<Message>;
  let messageService: MessageService;
  let conversationService: ConversationService;

  const realtime = { emitToUser: jest.fn() };
  const attachments = { destroy: jest.fn() };

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_reactions');
    conversationModel = connection.model<Conversation>(
      Conversation.name,
      ConversationSchema,
    );
    messageModel = connection.model<Message>(Message.name, MessageSchema);
    await Promise.all([conversationModel.init(), messageModel.init()]);

    messageService = new MessageService(
      messageModel as any,
      conversationModel as any,
      realtime as any,
      {} as any,
      connection,
      attachments as any,
    );
    // getMessages only reads conversations and messages
    conversationService = new ConversationService(
      conversationModel as any,
      messageModel as any,
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

  afterEach(async () => {
    await Promise.all([
      conversationModel.deleteMany({}),
      messageModel.deleteMany({}),
    ]);
  });

  const users = (n: number) =>
    Array.from({ length: n }, () => new Types.ObjectId());

  // A group of the given members with one text message from the first one
  const setup = async (members: Types.ObjectId[], type?: 'system') => {
    const conversation = await conversationModel.create({
      type: 'group',
      group: { name: 'Nhóm', createdBy: members[0] },
      participants: members.map((userId) => ({ userId, joinedAt: new Date() })),
      lastSeq: 1,
      lastMessageAt: new Date(),
    });
    const message = await messageModel.create({
      conversationId: conversation._id,
      senderId: members[0],
      content: 'xin chào',
      seq: 1,
      ...(type ? { type, system: { action: 'group_renamed' } } : {}),
    });
    return message._id.toString();
  };

  const stored = (messageId: string) =>
    messageModel.findById(messageId).lean().orFail();

  it('20 users reacting and changing at once: one reaction each, +1 version per change', async () => {
    const members = users(20);
    const messageId = await setup(members);

    await Promise.all(
      members.map((u, i) =>
        messageService.setReaction(
          messageId,
          u.toString(),
          REACTION_EMOJIS[i % 5],
        ),
      ),
    );
    await Promise.all(
      members.map((u, i) =>
        messageService.setReaction(
          messageId,
          u.toString(),
          REACTION_EMOJIS[(i + 1) % 5],
        ),
      ),
    );

    let message = await stored(messageId);
    expect(message.reactions).toHaveLength(20);
    expect(
      new Set(message.reactions!.map((r) => r.userId.toString())).size,
    ).toBe(20);
    for (const r of message.reactions!) {
      const i = members.findIndex((u) => u.equals(r.userId));
      expect(r.emoji).toBe(REACTION_EMOJIS[(i + 1) % 5]);
    }
    expect(message.reactionsVersion).toBe(40);

    // Half remove at once
    await Promise.all(
      members
        .slice(0, 10)
        .map((u) => messageService.setReaction(messageId, u.toString(), null)),
    );
    message = await stored(messageId);
    expect(message.reactions!.map((r) => r.userId.toString()).sort()).toEqual(
      members
        .slice(10)
        .map((u) => u.toString())
        .sort(),
    );
    expect(message.reactionsVersion).toBe(50);
    // 50 stored changes → 50 × 20 member emits, each after its write
    expect(realtime.emitToUser).toHaveBeenCalledTimes(50 * 20);
  });

  it('one user flipping emoji concurrently keeps exactly one reaction', async () => {
    const [me, other] = users(2);
    const messageId = await setup([me, other]);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        messageService.setReaction(
          messageId,
          me.toString(),
          REACTION_EMOJIS[i % 5],
        ),
      ),
    );
    const message = await stored(messageId);
    expect(message.reactions).toHaveLength(1);
    expect(message.reactions![0].userId.equals(me)).toBe(true);
    // Each stored change bumped the version once; the highest response matches the store
    expect(Math.max(...results.map((r) => r.reactionsVersion))).toBe(
      message.reactionsVersion,
    );
    expect(
      results.find((r) => r.reactionsVersion === message.reactionsVersion)!
        .reactions,
    ).toEqual([{ userId: me.toString(), emoji: message.reactions![0].emoji }]);
  });

  it('same emoji again and removing nothing are no-ops (no bump, no emit)', async () => {
    const [me, other] = users(2);
    const messageId = await setup([me, other]);
    await messageService.setReaction(messageId, me.toString(), '👍');
    realtime.emitToUser.mockClear();

    const again = await messageService.setReaction(
      messageId,
      me.toString(),
      '👍',
    );
    const none = await messageService.setReaction(
      messageId,
      other.toString(),
      null,
    );
    expect(again.reactionsVersion).toBe(1);
    expect(none.reactionsVersion).toBe(1);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
    expect((await stored(messageId)).reactionsVersion).toBe(1);
  });

  it('removing the last reaction leaves the field absent; history sends string ids', async () => {
    const [me, other] = users(2);
    const messageId = await setup([me, other]);
    await messageService.setReaction(messageId, other.toString(), '😮');

    const conversationId = (await stored(messageId)).conversationId.toString();
    const page = await conversationService.getMessages(
      conversationId,
      me.toString(),
    );
    expect(page.messages[0]).toMatchObject({
      reactions: [{ userId: other.toString(), emoji: '😮' }],
      reactionsVersion: 1,
    });

    await messageService.setReaction(messageId, other.toString(), null);
    const message = await stored(messageId);
    expect(message).not.toHaveProperty('reactions');
    expect(message.reactionsVersion).toBe(2);
    const after = await conversationService.getMessages(
      conversationId,
      me.toString(),
    );
    expect(after.messages[0].reactions).toBeUndefined();
  });

  it('a revoke racing reactions leaves none, and later reactions are refused', async () => {
    const members = users(20);
    const messageId = await setup(members);
    await messageService.setReaction(messageId, members[1].toString(), '❤️');

    const outcomes = await Promise.allSettled([
      ...members.map((u, i) =>
        messageService.setReaction(
          messageId,
          u.toString(),
          REACTION_EMOJIS[i % 5],
        ),
      ),
      messageService.revokeMessage(messageId, members[0].toString()),
    ]);
    // Reactions after the revoke are refused, never stored
    for (const o of outcomes) {
      if (o.status === 'rejected') {
        expect(o.reason).toBeInstanceOf(BadRequestException);
      }
    }
    expect(outcomes[outcomes.length - 1].status).toBe('fulfilled');

    const message = await stored(messageId);
    expect(message.isRevoked).toBe(true);
    expect(message).not.toHaveProperty('reactions');
    await expect(
      messageService.setReaction(messageId, members[2].toString(), '👍'),
    ).rejects.toThrow('Tin nhắn này đã bị thu hồi');
    expect(await stored(messageId)).not.toHaveProperty('reactions');
  });

  it('system messages and non-members are refused', async () => {
    const [me, other] = users(2);
    const systemId = await setup([me, other], 'system');
    await expect(
      messageService.setReaction(systemId, me.toString(), '👍'),
    ).rejects.toThrow('Không thể thả cảm xúc cho tin hệ thống');

    const messageId = await setup([me, other]);
    await expect(
      messageService.setReaction(
        messageId,
        new Types.ObjectId().toString(),
        '👍',
      ),
    ).rejects.toThrow('Tin nhắn không tồn tại');
    expect(await stored(messageId)).not.toHaveProperty('reactions');
    expect(await stored(systemId)).not.toHaveProperty('reactions');
  });
});
