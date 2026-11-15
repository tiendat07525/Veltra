import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { User } from 'src/users/schemas/user.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import { NotificationService } from './notification.service';
import { Notification } from './schemas/notification.schema';

describe('NotificationService', () => {
  let service: NotificationService;

  const me = new Types.ObjectId();
  const actor = new Types.ObjectId();
  const other = new Types.ObjectId();
  const groupId = new Types.ObjectId();
  const createdAt = new Date('2026-11-16T10:00:00.000Z');

  // find(...).sort(...).limit(...).populate(...).lean()
  const listChain = {
    sort: jest.fn(),
    limit: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn(),
  };

  const notificationModel = {
    insertMany: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
    updateOne: jest.fn(),
    exists: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };

  const userModel = { findById: jest.fn() };
  const realtimeService = { emitToUser: jest.fn() };

  const actorDoc = {
    _id: actor,
    username: 'actor',
    displayName: 'Actor',
    avatarUrl: undefined,
  };

  const storedDoc = (userId: Types.ObjectId, extra: object = {}) => ({
    _id: new Types.ObjectId(),
    userId,
    type: 'group_added',
    actorId: actor,
    conversationId: groupId,
    groupName: 'Nhóm A',
    readAt: null,
    createdAt,
    ...extra,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    listChain.sort.mockReturnValue(listChain);
    listChain.limit.mockReturnValue(listChain);
    listChain.populate.mockReturnValue(listChain);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: RealtimeService, useValue: realtimeService },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  describe('notify', () => {
    beforeEach(() => {
      userModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(actorDoc),
      });
    });

    it('stores one per recipient (no actor, no duplicates), then emits notification:new with each unread count', async () => {
      const docs = [storedDoc(me), storedDoc(other)];
      notificationModel.insertMany.mockResolvedValue(docs);
      notificationModel.aggregate.mockResolvedValue([
        { _id: me, count: 3 },
        { _id: other, count: 1 },
      ]);

      await service.notify([me, other, actor, new Types.ObjectId(me)], {
        type: 'group_added',
        actorId: actor,
        conversationId: groupId,
        groupName: 'Nhóm A',
      });

      const [[inserted]] = notificationModel.insertMany.mock.calls as [
        { userId: Types.ObjectId }[],
      ][];
      expect(inserted.map((doc) => doc.userId.toString())).toEqual([
        me.toString(),
        other.toString(),
      ]);

      // Emitted only after the insert resolved
      expect(
        notificationModel.insertMany.mock.invocationCallOrder[0],
      ).toBeLessThan(realtimeService.emitToUser.mock.invocationCallOrder[0]);

      expect(realtimeService.emitToUser).toHaveBeenCalledTimes(2);
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        me.toString(),
        'notification:new',
        {
          notification: {
            _id: docs[0]._id.toString(),
            type: 'group_added',
            actor: {
              _id: actor.toString(),
              username: 'actor',
              displayName: 'Actor',
              avatarUrl: undefined,
            },
            conversationId: groupId.toString(),
            groupName: 'Nhóm A',
            isRead: false,
            createdAt,
          },
          unreadCount: 3,
        },
      );
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        other.toString(),
        'notification:new',
        expect.objectContaining({ unreadCount: 1 }),
      );
    });

    it('does nothing when the only recipient is the actor', async () => {
      await service.notify([actor], { type: 'group_owner', actorId: actor });

      expect(notificationModel.insertMany).not.toHaveBeenCalled();
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it('never throws and emits nothing when the insert fails', async () => {
      notificationModel.insertMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.notify([me], { type: 'friend_request', actorId: actor }),
      ).resolves.toBeUndefined();
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('removeFriendRequestNotifications', () => {
    it("deletes only the recipient's friend_request notifications from that actor and emits notification:removed", async () => {
      const ids = [new Types.ObjectId(), new Types.ObjectId()];
      notificationModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
      });
      notificationModel.deleteMany.mockResolvedValue({ deletedCount: 2 });
      notificationModel.countDocuments.mockResolvedValue(4);

      await service.removeFriendRequestNotifications(me, actor);

      expect(notificationModel.find).toHaveBeenCalledWith(
        { userId: me, actorId: actor, type: 'friend_request' },
        '_id',
      );
      expect(notificationModel.deleteMany).toHaveBeenCalledWith({
        _id: { $in: ids },
        userId: me,
      });
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        me.toString(),
        'notification:removed',
        { notificationIds: ids.map((id) => id.toString()), unreadCount: 4 },
      );
    });

    it('emits nothing when there is no matching notification', async () => {
      notificationModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.removeFriendRequestNotifications(me, actor);

      expect(notificationModel.deleteMany).not.toHaveBeenCalled();
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
      notificationModel.find.mockImplementation(() => {
        throw new Error('db down');
      });

      await expect(
        service.removeFriendRequestNotifications(me, actor),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => notificationModel.find.mockReturnValue(listChain));

    it("returns only the user's notifications, newest first, with hasMore", async () => {
      const docs = [
        { ...storedDoc(me), actorId: actorDoc },
        { ...storedDoc(me), actorId: null },
        { ...storedDoc(me), actorId: actorDoc },
      ];
      listChain.lean.mockResolvedValue(docs);

      const result = await service.list(me.toString(), { limit: 2 });

      expect(notificationModel.find).toHaveBeenCalledWith({ userId: me });
      expect(listChain.sort).toHaveBeenCalledWith({ _id: -1 });
      expect(listChain.limit).toHaveBeenCalledWith(3);
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].actor?._id).toBe(actor.toString());
      // Deleted actor account
      expect(result.items[1].actor).toBeNull();
    });

    it('pages with before = older than that id, default page size 20', async () => {
      listChain.lean.mockResolvedValue([]);
      const before = new Types.ObjectId();

      const result = await service.list(me.toString(), {
        before: before.toString(),
      });

      expect(notificationModel.find).toHaveBeenCalledWith({
        userId: me,
        _id: { $lt: before },
      });
      expect(listChain.limit).toHaveBeenCalledWith(21);
      expect(result).toEqual({ items: [], hasMore: false });
    });
  });

  describe('markAsRead', () => {
    const id = new Types.ObjectId();

    it('marks only a notification of the user, emits notification:read and returns the unread count', async () => {
      notificationModel.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      notificationModel.countDocuments.mockResolvedValue(2);

      const result = await service.markAsRead(id.toString(), me.toString());

      const [[filter, update]] = notificationModel.updateOne.mock.calls as [
        object,
        { $set: { readAt: unknown } },
      ][];
      // Own and still unread only; a plain update (no pipeline)
      expect(filter).toEqual({ _id: id, userId: me, readAt: null });
      expect(update.$set.readAt).toBeInstanceOf(Date);
      expect(result).toEqual({ unreadCount: 2 });
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        me.toString(),
        'notification:read',
        { notificationId: id.toString(), unreadCount: 2 },
      );
    });

    it('already read: 200 with the count, no event', async () => {
      notificationModel.updateOne.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });
      notificationModel.exists.mockResolvedValue({ _id: id });
      notificationModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.markAsRead(id.toString(), me.toString()),
      ).resolves.toEqual({ unreadCount: 0 });

      expect(notificationModel.exists).toHaveBeenCalledWith({
        _id: id,
        userId: me,
      });
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it("404 for another user's (or a missing) notification", async () => {
      notificationModel.updateOne.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });
      notificationModel.exists.mockResolvedValue(null);

      await expect(
        service.markAsRead(id.toString(), me.toString()),
      ).rejects.toThrow(NotFoundException);
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it('400 for a malformed id, no query', async () => {
      await expect(service.markAsRead('nope', me.toString())).rejects.toThrow(
        BadRequestException,
      );
      expect(notificationModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it("marks the user's unread notifications and emits notification:read { all }", async () => {
      notificationModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await service.markAllAsRead(me.toString());

      const [[filter, update]] = notificationModel.updateMany.mock.calls as [
        object,
        { $set: { readAt: unknown } },
      ][];
      expect(filter).toEqual({ userId: me, readAt: null });
      expect(update.$set.readAt).toBeInstanceOf(Date);
      expect(result).toEqual({ unreadCount: 0 });
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        me.toString(),
        'notification:read',
        { all: true, unreadCount: 0 },
      );
    });

    it('nothing unread: no event', async () => {
      notificationModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await service.markAllAsRead(me.toString());

      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });
  });

  it('getUnreadCount counts unread notifications of the user', async () => {
    notificationModel.countDocuments.mockResolvedValue(5);

    await expect(service.getUnreadCount(me.toString())).resolves.toEqual({
      unreadCount: 5,
    });
    expect(notificationModel.countDocuments).toHaveBeenCalledWith({
      userId: me,
      readAt: null,
    });
  });
});
