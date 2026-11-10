import mongoose, { Types } from 'mongoose';
import {
  FriendRequest,
  FriendRequestSchema,
} from '../src/friend/schema/friend-request.schema';

// Runs the real schema hooks; validate() needs no database connection
describe('FriendRequestSchema pre-validate hook', () => {
  const FriendRequestModel = mongoose.model<FriendRequest>(
    'FriendRequestSchemaSpec',
    FriendRequestSchema,
  );

  const userA = new Types.ObjectId('6aea9a29fb472e3791ae57aa');
  const userB = new Types.ObjectId('6aea9a29fb472e3791ae57ab');
  const expectedPairKey = `${userA.toString()}_${userB.toString()}`;

  it('should set pairKey and pass validation', async () => {
    const request = new FriendRequestModel({ from: userA, to: userB });

    await expect(request.validate()).resolves.toBeUndefined();
    expect(request.pairKey).toBe(expectedPairKey);
  });

  it('should produce the same pairKey regardless of direction', async () => {
    const request = new FriendRequestModel({ from: userB, to: userA });

    await request.validate();

    expect(request.pairKey).toBe(expectedPairKey);
  });

  it('should still reject a request without a recipient', async () => {
    const request = new FriendRequestModel({ from: userA });

    await expect(request.validate()).rejects.toThrow(/to/);
  });
});
