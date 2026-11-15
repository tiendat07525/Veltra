import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../src/users/schemas/user.schema';
import { Friend } from '../../src/friend/schema/friend.schema';
import { RealtimeService } from '../../src/realtime/realtime.service';

// User/Friend models used by ConversationService when adding users to a group.
// Default: every queried user exists and is a friend (counts equal the query size).
export const allowAllGroupLookups = () => ({
  userModel: {
    countDocuments: jest.fn((filter: { _id: { $in: unknown[] } }) =>
      Promise.resolve(filter._id.$in.length),
    ),
    // Display names for system messages: none found → "Người dùng"
    find: jest.fn<{ lean: jest.Mock }, [filter: unknown]>(() => ({
      lean: jest.fn().mockResolvedValue([]),
    })),
  },
  friendModel: {
    countDocuments: jest.fn((filter: { $or: unknown[] }) =>
      Promise.resolve(filter.$or.length),
    ),
  },
});

// Stubs the writes of a group change (ConversationService.applyGroupChange):
// 1st findOneAndUpdate = the conditional change + $inc lastSeq (returns lastSeq = seq),
// messageModel.create = the system message, 2nd findOneAndUpdate = lastMessage (returns `result`).
export const stubGroupChangeWrites = (
  conversationModel: { findOneAndUpdate: jest.Mock },
  messageModel: { create: jest.Mock },
  result: object,
  seq = 1,
) => {
  conversationModel.findOneAndUpdate
    .mockResolvedValueOnce({ lastSeq: seq })
    .mockResolvedValueOnce(result);
  messageModel.create.mockImplementation(([doc]: [Record<string, unknown>]) =>
    Promise.resolve([
      {
        ...doc,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  );
};

// Every ConversationService dependency besides the Conversation/Message models.
// RealtimeService and the connection are inert defaults; a spec that asserts on them
// lists its own provider after this spread (the last provider for a token wins).
export const groupLookupProviders = (
  mocks: ReturnType<typeof allowAllGroupLookups> = allowAllGroupLookups(),
) => [
  { provide: getModelToken(User.name), useValue: mocks.userModel },
  { provide: getModelToken(Friend.name), useValue: mocks.friendModel },
  { provide: RealtimeService, useValue: { emitToUser: jest.fn() } },
  {
    provide: getConnectionToken(),
    useValue: {
      transaction: jest.fn((fn: (session: object) => unknown) => fn({})),
    },
  },
];
