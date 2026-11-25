import { randomUUID } from 'crypto';
import { HttpException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import { MessageService } from '../src/messages/message.service';
import { Message, MessageSchema } from '../src/messages/schemas/message.schema';
import { ConversationService } from '../src/conversation/conversation.service';
import { ConversationGroupService } from '../src/conversation/conversation-group.service';
import {
  Conversation,
  ConversationSchema,
} from '../src/conversation/schemas/conversation.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import { Friend, FriendSchema } from '../src/friend/schema/friend.schema';
import { connectTestDatabase } from './helpers/mongo-e2e';

/**
 * Sends and group changes against a real replica set: seq has no gaps under concurrency,
 * a retried send is stored once, a refused change leaves nothing behind.
 */
describe('Send and group-change transactions (Real MongoDB replica set)', () => {
  let connection: Connection;
  let conversationModel: Model<Conversation>;
  let messageModel: Model<Message>;
  let userModel: Model<User>;
  let friendModel: Model<Friend>;
  let messageService: MessageService;
  let groupService: ConversationGroupService;

  const realtime = { emitToUser: jest.fn() };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const attachments = {
    resolve: jest.fn().mockResolvedValue([]),
    destroy: jest.fn(),
  };

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_tx');
    conversationModel = connection.model<Conversation>(
      Conversation.name,
      ConversationSchema,
    );
    messageModel = connection.model<Message>(Message.name, MessageSchema);
    userModel = connection.model<User>(User.name, UserSchema);
    friendModel = connection.model<Friend>(Friend.name, FriendSchema);
    // Waits until the collections and indexes exist
    await Promise.all([
      conversationModel.init(),
      messageModel.init(),
      userModel.init(),
      friendModel.init(),
    ]);

    groupService = new ConversationGroupService(
      conversationModel as any,
      messageModel as any,
      userModel as any,
      friendModel as any,
      realtime as any,
      notifications as any,
      connection,
    );
    const conversationService = new ConversationService(
      conversationModel as any,
      messageModel as any,
      userModel as any,
      realtime as any,
      groupService,
      notifications as any,
    );
    messageService = new MessageService(
      messageModel as any,
      conversationModel as any,
      realtime as any,
      conversationService,
      connection,
      attachments as any,
    );
  }, 30000);

  afterAll(async () => {
    if (!connection) return;
    await connection.dropDatabase();
    await connection.close();
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
    // Refused sends are logged by the service
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      conversationModel.deleteMany({}),
      messageModel.deleteMany({}),
      userModel.deleteMany({}),
      friendModel.deleteMany({}),
    ]);
  });

  const createUser = async (name: string) => {
    const user = await userModel.create({
      username: name,
      email: `${name}@example.com`,
      password: 'not-a-real-hash',
      displayName: name,
    });
    return user._id;
  };

  // A group owned by the first user; the others are members
  const createGroup = async (...userIds: Types.ObjectId[]) => {
    const group = await conversationModel.create({
      type: 'group',
      group: { name: 'Nhóm', createdBy: userIds[0] },
      participants: userIds.map((userId) => ({ userId, joinedAt: new Date() })),
      lastMessageAt: new Date(),
    });
    return group._id;
  };

  const send = (
    conversationId: Types.ObjectId,
    senderId: Types.ObjectId,
    content: string,
    clientMsgId: string = randomUUID(),
  ) =>
    messageService.sendDirectMessage(
      { conversationId: conversationId.toString(), content, clientMsgId },
      senderId.toString(),
    );

  // seq is 1..n with no gap, and the conversation points at the newest message
  const expectContiguous = async (
    conversationId: Types.ObjectId,
    n: number,
  ) => {
    const stored = await messageModel
      .find({ conversationId })
      .sort({ seq: 1 })
      .lean();
    expect(stored.map((m) => m.seq)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    );
    const conversation = await conversationModel
      .findById(conversationId)
      .lean();
    expect(conversation?.lastSeq).toBe(n);
    expect(conversation?.lastMessage?.seq).toBe(n);
    expect(String(conversation?.lastMessage?._id)).toBe(
      String(stored[n - 1]._id),
    );
    return { stored, conversation };
  };

  const lastReadSeqOf = (
    conversation: { participants: { userId: unknown; lastReadSeq: number }[] },
    userId: Types.ObjectId,
  ) =>
    conversation.participants.find((p) => String(p.userId) === String(userId))
      ?.lastReadSeq;

  // The transaction updates the conversation twice (seq, then the rest): the 2nd one fails
  const failLastUpdate = () => {
    const original = conversationModel.findOneAndUpdate.bind(conversationModel);
    let calls = 0;
    jest
      .spyOn(conversationModel as any, 'findOneAndUpdate')
      .mockImplementation((...args: any[]) => {
        calls += 1;
        return calls === 2
          ? Promise.reject(new Error('last step failed'))
          : original(...(args as Parameters<typeof original>));
      });
  };

  const expectNothingStored = async (conversationId: Types.ObjectId) => {
    expect(await messageModel.countDocuments({ conversationId })).toBe(0);
    const conversation = await conversationModel
      .findById(conversationId)
      .lean();
    expect(conversation?.lastSeq).toBe(0);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
    return conversation;
  };

  const emits = (event: string) =>
    realtime.emitToUser.mock.calls.filter((call) => call[1] === event);

  const statusOf = (result: PromiseSettledResult<unknown>) =>
    result.status === 'rejected' && result.reason instanceof HttpException
      ? result.reason.getStatus()
      : result.status;

  describe('sending', () => {
    it('should give 20 concurrent sends contiguous seq numbers', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          send(conversationId, i % 2 ? an : binh, `tin ${i}`),
        ),
      );

      const { stored, conversation } = await expectContiguous(
        conversationId,
        20,
      );
      expect(new Set(results.map((r) => r.data.seq)).size).toBe(20);
      // Each sender has read up to their own newest message
      for (const userId of [an, binh]) {
        const ownMax = Math.max(
          ...stored
            .filter((m) => String(m.senderId) === String(userId))
            .map((m) => m.seq),
        );
        expect(lastReadSeqOf(conversation!, userId)).toBe(ownMax);
      }
      // One message:new per message and member
      expect(emits('message:new')).toHaveLength(40);
    }, 60000);

    it('should store 5 concurrent copies of one clientMsgId once', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      const clientMsgId = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          send(conversationId, an, 'một lần', clientMsgId),
        ),
      );

      const { stored } = await expectContiguous(conversationId, 1);
      expect(new Set(results.map((r) => r.data._id))).toEqual(
        new Set([String(stored[0]._id)]),
      );
      expect(emits('message:new')).toHaveLength(2);
    }, 60000);

    it('should roll back the seq increment when the unique index refuses a copy', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      const clientMsgId = randomUUID();
      const first = await send(conversationId, an, 'gốc', clientMsgId);

      // The retry does not see the stored message, so its insert hits the index (E11000)
      const findOne = jest
        .spyOn(messageModel as any, 'findOne')
        .mockResolvedValueOnce(null);
      const retry = await send(conversationId, an, 'gốc', clientMsgId);

      expect(findOne).toHaveBeenCalledTimes(2);
      expect(retry.data._id).toBe(first.data._id);
      await expectContiguous(conversationId, 1);
      expect(emits('message:new')).toHaveLength(2);

      // The next message continues without a gap
      await send(conversationId, binh, 'tiếp');
      await expectContiguous(conversationId, 2);
    }, 60000);

    it('should store nothing when the last step of a send fails', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      failLastUpdate();

      await expect(send(conversationId, an, 'mất')).rejects.toThrow();

      await expectNothingStored(conversationId);
      await send(conversationId, an, 'tiếp');
      await expectContiguous(conversationId, 1);
    }, 60000);

    it('should refuse a send whose sender is removed while its files are checked', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      attachments.resolve.mockImplementationOnce(async () => {
        await groupService.removeParticipant(
          conversationId.toString(),
          binh.toString(),
          an.toString(),
        );
        return [];
      });

      await expect(send(conversationId, binh, 'lọt')).rejects.toMatchObject({
        status: 400,
        message: 'Bạn không có quyền gửi tin nhắn',
      });

      // Only the system message of the removal
      const { stored } = await expectContiguous(conversationId, 1);
      expect(stored[0].system?.action).toBe('member_removed');
      expect(emits('message:new').map((call) => String(call[0]))).toEqual([
        String(an),
      ]);
    }, 60000);

    it('should answer 404 when the conversation is deleted while files are checked', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      attachments.resolve.mockImplementationOnce(async () => {
        await conversationModel.deleteOne({ _id: conversationId });
        return [];
      });

      await expect(send(conversationId, an, 'mất')).rejects.toMatchObject({
        status: 404,
      });

      expect(await messageModel.countDocuments({ conversationId })).toBe(0);
    }, 60000);

    it('should never store a message after its sender was removed', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const rounds = 10;
      for (let round = 0; round < rounds; round++) {
        const conversationId = await createGroup(an, binh);

        const results = await Promise.allSettled([
          send(conversationId, binh, 'tin 1'),
          groupService.removeParticipant(
            conversationId.toString(),
            binh.toString(),
            an.toString(),
          ),
          send(conversationId, binh, 'tin 2'),
        ]);

        expect(results[1].status).toBe('fulfilled');
        const sends = [results[0], results[2]].map(statusOf);
        const accepted = sends.filter((s) => s === 'fulfilled').length;
        expect(sends.filter((s) => s === 400)).toHaveLength(2 - accepted);
        // Every accepted message is before the removal
        const { stored } = await expectContiguous(conversationId, accepted + 1);
        expect(stored[accepted].system?.action).toBe('member_removed');
      }
    }, 60000);

    it('should accept the same clientMsgId from two different senders', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      const clientMsgId = randomUUID();

      await send(conversationId, an, 'của An', clientMsgId);
      await send(conversationId, binh, 'của Bình', clientMsgId);

      await expectContiguous(conversationId, 2);
    }, 60000);
  });

  describe('group changes', () => {
    it('should record add, transfer, remove and leave as contiguous system messages', async () => {
      const [an, binh, chi] = [
        await createUser('an'),
        await createUser('binh'),
        await createUser('chi'),
      ];
      await friendModel.create({ user: an, friend: chi });
      const conversationId = await createGroup(an, binh);
      const id = conversationId.toString();

      await groupService.addParticipants(
        id,
        { userIds: [chi.toString()] },
        an.toString(),
      );
      const afterAdd = await expectContiguous(conversationId, 1);
      // Only the "added" message is unread for the new member
      expect(lastReadSeqOf(afterAdd.conversation!, chi)).toBe(0);
      expect(lastReadSeqOf(afterAdd.conversation!, an)).toBe(1);

      await groupService.transferOwnership(
        id,
        { userId: binh.toString() },
        an.toString(),
      );
      await groupService.removeParticipant(id, chi.toString(), binh.toString());
      await groupService.leaveGroup(id, an.toString());

      const { stored, conversation } = await expectContiguous(
        conversationId,
        4,
      );
      expect(stored.map((m) => m.system?.action)).toEqual([
        'members_added',
        'owner_transferred',
        'member_removed',
        'member_left',
      ]);
      expect(conversation!.participants.map((p) => String(p.userId))).toEqual([
        String(binh),
      ]);
      expect(String(conversation!.group?.createdBy)).toBe(String(binh));
      expect(
        emits('conversation:removed').map((call) => String(call[0])),
      ).toEqual([String(chi), String(an)]);
    }, 60000);

    it('should change nothing when the last step of a removal fails', async () => {
      const [an, binh] = [await createUser('an'), await createUser('binh')];
      const conversationId = await createGroup(an, binh);
      failLastUpdate();

      await expect(
        groupService.removeParticipant(
          conversationId.toString(),
          binh.toString(),
          an.toString(),
        ),
      ).rejects.toThrow();

      const conversation = await expectNothingStored(conversationId);
      expect(conversation!.participants).toHaveLength(2);
    }, 60000);

    it('should apply one of two concurrent removals and leave no seq gap', async () => {
      const [an, binh, chi] = [
        await createUser('an'),
        await createUser('binh'),
        await createUser('chi'),
      ];
      const conversationId = await createGroup(an, binh, chi);

      const results = await Promise.allSettled(
        [1, 2].map(() =>
          groupService.removeParticipant(
            conversationId.toString(),
            chi.toString(),
            an.toString(),
          ),
        ),
      );

      const statuses = results.map(statusOf);
      expect(statuses.filter((s) => s === 'fulfilled')).toHaveLength(1);
      // 409 lost the race in the write, 404 already saw the member gone
      expect([404, 409]).toContain(statuses.find((s) => s !== 'fulfilled'));
      await expectContiguous(conversationId, 1);
      expect(emits('conversation:removed')).toHaveLength(1);
    }, 60000);

    it('should keep one seq line for concurrent sends and group changes', async () => {
      const [an, binh, chi] = [
        await createUser('an'),
        await createUser('binh'),
        await createUser('chi'),
      ];
      await friendModel.create({ user: an, friend: chi });
      const conversationId = await createGroup(an, binh);
      const id = conversationId.toString();

      await Promise.all([
        ...Array.from({ length: 8 }, (_, i) =>
          send(conversationId, binh, `tin ${i}`),
        ),
        groupService.update(id, { groupName: 'Tên mới' }, an.toString()),
        groupService.addParticipants(
          id,
          { userIds: [chi.toString()] },
          an.toString(),
        ),
      ]);

      const { stored, conversation } = await expectContiguous(
        conversationId,
        10,
      );
      expect(conversation!.group?.name).toBe('Tên mới');
      const added = stored.find((m) => m.system?.action === 'members_added');
      expect(lastReadSeqOf(conversation!, chi)).toBe(added!.seq - 1);
    }, 60000);
  });
});
