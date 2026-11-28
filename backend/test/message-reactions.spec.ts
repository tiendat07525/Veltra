import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { MessageService } from '../src/messages/message.service';
import { ReactionDto } from '../src/messages/dto/reaction.dto';
import {
  REACTION_EMOJIS,
  toMessagePayload,
} from '../src/messages/schemas/message.schema';

// Query stub for `.select(...).lean()`
const query = (value: unknown) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

describe('Message reactions', () => {
  const me = new Types.ObjectId();
  const other = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const messageId = new Types.ObjectId();

  let messageModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock };
  let conversationModel: { findOne: jest.Mock };
  let realtime: { emitToUser: jest.Mock };
  let service: MessageService;
  let order: string[];

  const members = {
    _id: conversationId,
    participants: [{ userId: me }, { userId: other }],
  };

  beforeEach(() => {
    order = [];
    messageModel = {
      findById: jest
        .fn()
        .mockReturnValue(query({ _id: messageId, conversationId })),
      findOneAndUpdate: jest.fn(),
    };
    conversationModel = { findOne: jest.fn().mockReturnValue(query(members)) };
    realtime = {
      emitToUser: jest.fn(() => order.push('emit')),
    };
    service = new MessageService(
      messageModel as any,
      conversationModel as any,
      realtime as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const stored = (
    reactions: { userId: Types.ObjectId; emoji: string }[],
    version: number,
  ) => {
    messageModel.findOneAndUpdate.mockImplementation(() => {
      order.push('write');
      return query({
        _id: messageId,
        conversationId,
        reactions,
        reactionsVersion: version,
      });
    });
  };

  describe('ReactionDto', () => {
    it('accepts exactly the five emoji', async () => {
      for (const emoji of REACTION_EMOJIS) {
        expect(
          await validate(plainToInstance(ReactionDto, { emoji })),
        ).toHaveLength(0);
      }
      expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '😮', '😢']);
    });

    it.each(['🔥', '❤', '👍👍', '', 'like', 1, null])(
      'rejects %p',
      async (emoji) => {
        expect(
          await validate(plainToInstance(ReactionDto, { emoji })),
        ).not.toHaveLength(0);
      },
    );
  });

  it('400 for malformed ids before any query', async () => {
    await expect(
      service.setReaction('nope', me.toString(), '👍'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setReaction(messageId.toString(), 'nope', '👍'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(messageModel.findById).not.toHaveBeenCalled();
  });

  it('404 for a missing message', async () => {
    messageModel.findById.mockReturnValue(query(null));
    await expect(
      service.setReaction(messageId.toString(), me.toString(), '👍'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(messageModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a non-member gets the same 404 as a missing message and nothing is written', async () => {
    conversationModel.findOne.mockReturnValue(query(null));
    const outsider = new Types.ObjectId();
    await expect(
      service.setReaction(messageId.toString(), outsider.toString(), '👍'),
    ).rejects.toThrow('Tin nhắn không tồn tại');
    expect(conversationModel.findOne).toHaveBeenCalledWith({
      _id: conversationId,
      'participants.userId': outsider,
    });
    expect(messageModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('PUT: one atomic update that skips revoked / system messages and no-op changes', async () => {
    stored([{ userId: me, emoji: '❤️' }], 3);
    await service.setReaction(messageId.toString(), me.toString(), '❤️');

    const [filter, update, options] =
      messageModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: messageId,
      isRevoked: { $ne: true },
      type: { $ne: 'system' },
      reactions: { $not: { $elemMatch: { userId: me, emoji: '❤️' } } },
    });
    expect(Array.isArray(update)).toBe(true);
    expect(JSON.stringify(update)).toContain('"$$REMOVE"');
    expect(options).toEqual({ returnDocument: 'after', updatePipeline: true });
  });

  it('DELETE: only matches when I have a reaction', async () => {
    stored([], 4);
    await service.setReaction(messageId.toString(), me.toString(), null);
    const [filter, update] = messageModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: messageId,
      isRevoked: { $ne: true },
      type: { $ne: 'system' },
      'reactions.userId': me,
    });
    // No new entry is appended
    expect(JSON.stringify(update)).not.toContain('$literal');
  });

  it('emits message:reaction to every member after the write, with string ids', async () => {
    stored(
      [
        { userId: other, emoji: '👍' },
        { userId: me, emoji: '😂' },
      ],
      7,
    );
    const res = await service.setReaction(
      messageId.toString(),
      me.toString(),
      '😂',
    );

    const payload = {
      messageId: messageId.toString(),
      conversationId: conversationId.toString(),
      reactions: [
        { userId: other.toString(), emoji: '👍' },
        { userId: me.toString(), emoji: '😂' },
      ],
      reactionsVersion: 7,
    };
    expect(res).toEqual(payload);
    expect(order).toEqual(['write', 'emit', 'emit']);
    expect(realtime.emitToUser.mock.calls).toEqual([
      [me.toString(), 'message:reaction', payload],
      [other.toString(), 'message:reaction', payload],
    ]);
  });

  it('nothing changed (same emoji again / nothing to remove): current state, no emit', async () => {
    messageModel.findOneAndUpdate.mockReturnValue(query(null));
    messageModel.findById
      .mockReturnValueOnce(query({ _id: messageId, conversationId }))
      .mockReturnValueOnce(
        query({
          _id: messageId,
          conversationId,
          reactions: [{ userId: me, emoji: '👍' }],
          reactionsVersion: 2,
        }),
      );
    const res = await service.setReaction(
      messageId.toString(),
      me.toString(),
      '👍',
    );
    expect(res).toEqual({
      messageId: messageId.toString(),
      conversationId: conversationId.toString(),
      reactions: [{ userId: me.toString(), emoji: '👍' }],
      reactionsVersion: 2,
    });
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ isRevoked: true }, 'Tin nhắn này đã bị thu hồi'],
    [{ type: 'system' }, 'Không thể thả cảm xúc cho tin hệ thống'],
  ])('400 when the message is %p, no emit', async (state, error) => {
    messageModel.findOneAndUpdate.mockReturnValue(query(null));
    messageModel.findById
      .mockReturnValueOnce(query({ _id: messageId, conversationId }))
      .mockReturnValueOnce(query({ _id: messageId, conversationId, ...state }));
    await expect(
      service.setReaction(messageId.toString(), me.toString(), '👍'),
    ).rejects.toThrow(error);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('message payloads carry reactions only when there are some', () => {
    const base = {
      _id: messageId,
      conversationId,
      senderId: me,
      content: 'hi',
      seq: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(toMessagePayload(base as any)).not.toHaveProperty('reactions');
    expect(
      toMessagePayload({ ...base, reactions: [], reactionsVersion: 2 } as any),
    ).not.toHaveProperty('reactions');
    expect(
      toMessagePayload({
        ...base,
        reactions: [{ userId: other, emoji: '😮' }],
        reactionsVersion: 5,
      } as any),
    ).toMatchObject({
      reactions: [{ userId: other.toString(), emoji: '😮' }],
      reactionsVersion: 5,
    });
  });
});
