import { getModelToken } from '@nestjs/mongoose';
import { User } from '../../src/users/schemas/user.schema';
import { Friend } from '../../src/friend/schema/friend.schema';

// User/Friend models used by ConversationService when adding users to a group.
// Default: every queried user exists and is a friend (counts equal the query size).
export const allowAllGroupLookups = () => ({
  userModel: {
    countDocuments: jest.fn((filter: { _id: { $in: unknown[] } }) =>
      Promise.resolve(filter._id.$in.length),
    ),
  },
  friendModel: {
    countDocuments: jest.fn((filter: { $or: unknown[] }) =>
      Promise.resolve(filter.$or.length),
    ),
  },
});

export const groupLookupProviders = (
  mocks: ReturnType<typeof allowAllGroupLookups> = allowAllGroupLookups(),
) => [
  { provide: getModelToken(User.name), useValue: mocks.userModel },
  { provide: getModelToken(Friend.name), useValue: mocks.friendModel },
];
