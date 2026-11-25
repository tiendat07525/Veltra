import { HttpException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import { FriendService } from '../src/friend/friend.service';
import { Friend, FriendSchema } from '../src/friend/schema/friend.schema';
import {
  FriendRequest,
  FriendRequestSchema,
} from '../src/friend/schema/friend-request.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import { connectTestDatabase } from './helpers/mongo-e2e';

/**
 * Friend requests against a real replica set: each request is handled exactly once,
 * and an accept that fails half way changes nothing.
 */
describe('Friend requests (Real MongoDB replica set)', () => {
  let connection: Connection;
  let friendModel: Model<Friend>;
  let requestModel: Model<FriendRequest>;
  let userModel: Model<User>;
  let service: FriendService;
  let an: string;
  let binh: string;

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
    removeFriendRequestNotifications: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_friends');
    friendModel = connection.model<Friend>(Friend.name, FriendSchema);
    requestModel = connection.model<FriendRequest>(
      FriendRequest.name,
      FriendRequestSchema,
    );
    userModel = connection.model<User>(User.name, UserSchema);
    // Waits until the collections and indexes exist
    await Promise.all([
      friendModel.init(),
      requestModel.init(),
      userModel.init(),
    ]);
    service = new FriendService(
      friendModel as any,
      requestModel as any,
      userModel as any,
      notifications as any,
      connection,
    );
  }, 30000);

  afterAll(async () => {
    if (!connection) return;
    await connection.dropDatabase();
    await connection.close();
  }, 30000);

  beforeEach(async () => {
    jest.clearAllMocks();
    [an, binh] = await Promise.all(['an', 'binh'].map(createUser));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!connection) return;
    await Promise.all([
      friendModel.deleteMany({}),
      requestModel.deleteMany({}),
      userModel.deleteMany({}),
    ]);
  });

  const createUser = async (name: string) => {
    const user = await userModel.create({
      username: name,
      email: `${name}@example.com`,
      password: 'not-a-real-hash',
      displayName: name,
    });
    return user._id.toString();
  };

  // An → Bình
  const createRequest = async () => {
    const { request } = await service.sendFriendRequest({ to: binh }, an);
    jest.clearAllMocks();
    return request._id.toString();
  };

  const statusOf = (result: PromiseSettledResult<unknown>) =>
    result.status === 'rejected' && result.reason instanceof HttpException
      ? result.reason.getStatus()
      : result.status;

  const friendCount = () => friendModel.countDocuments({});
  const requestCount = () => requestModel.countDocuments({});

  it('should make the two users friends and delete the request', async () => {
    const id = await createRequest();

    await service.acceptFriendRequest(id, binh);

    const [pair] = await friendModel.find().lean();
    expect([String(pair.user), String(pair.friend)]).toEqual([an, binh].sort());
    expect(await friendCount()).toBe(1);
    expect(await requestCount()).toBe(0);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  }, 60000);

  it('should accept once when 5 accepts arrive together', async () => {
    const id = await createRequest();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.acceptFriendRequest(id, binh)),
    );

    expect(results.map(statusOf).sort()).toEqual([
      404,
      404,
      404,
      404,
      'fulfilled',
    ]);
    expect(await friendCount()).toBe(1);
    expect(await requestCount()).toBe(0);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  }, 60000);

  it('should let exactly one of a concurrent accept and decline win', async () => {
    for (let round = 0; round < 10; round++) {
      const id = await createRequest();

      const [accept, decline] = (
        await Promise.allSettled([
          service.acceptFriendRequest(id, binh),
          service.declineFriendRequest(id, binh),
        ])
      ).map(statusOf);

      expect([accept, decline].sort()).toEqual([404, 'fulfilled']);
      expect(await friendCount()).toBe(accept === 'fulfilled' ? 1 : 0);
      expect(await requestCount()).toBe(0);
      await friendModel.deleteMany({});
    }
  }, 60000);

  it('should keep the request when making the friendship fails', async () => {
    const id = await createRequest();
    jest
      .spyOn(friendModel as any, 'create')
      .mockRejectedValueOnce(new Error('db down'));

    await expect(service.acceptFriendRequest(id, binh)).rejects.toThrow(
      'db down',
    );

    expect(await requestCount()).toBe(1);
    expect(await friendCount()).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();

    await service.acceptFriendRequest(id, binh);
    expect(await friendCount()).toBe(1);
    expect(await requestCount()).toBe(0);
  }, 60000);

  it('should clear a request left between friends', async () => {
    const id = await createRequest();
    await friendModel.create({
      user: new Types.ObjectId(an),
      friend: new Types.ObjectId(binh),
    });

    const result = await service.acceptFriendRequest(id, binh);

    expect(result.status).toBe(true);
    expect(await friendCount()).toBe(1);
    expect(await requestCount()).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  }, 60000);

  it('should store one request when both users send at the same time', async () => {
    const results = await Promise.allSettled([
      service.sendFriendRequest({ to: binh }, an),
      service.sendFriendRequest({ to: an }, binh),
      service.sendFriendRequest({ to: binh }, an),
    ]);

    expect(results.map(statusOf).sort()).toEqual([400, 400, 'fulfilled']);
    expect(await requestCount()).toBe(1);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  }, 60000);
});
