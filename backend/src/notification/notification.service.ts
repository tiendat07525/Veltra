import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import {
  ListNotificationsDto,
  NOTIFICATION_PAGE_SIZE,
} from './dto/list-notifications.dto';

const ACTOR_FIELDS = 'username displayName avatarUrl';

interface NotificationActor {
  _id: Types.ObjectId;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface NotifyInput {
  type: NotificationType;
  actorId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  groupName?: string;
}

// API / socket shape; the client builds the text from `type`
function toNotificationPayload(
  doc: {
    _id: Types.ObjectId;
    type: NotificationType;
    conversationId?: Types.ObjectId;
    groupName?: string;
    readAt?: Date | null;
    createdAt: Date;
  },
  actor: NotificationActor | null,
) {
  return {
    _id: doc._id.toString(),
    type: doc.type,
    // null when the actor's account no longer exists
    actor: actor
      ? {
          _id: actor._id.toString(),
          username: actor.username,
          displayName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        }
      : null,
    conversationId: doc.conversationId?.toString(),
    groupName: doc.groupName,
    isRead: !!doc.readAt,
    createdAt: doc.createdAt,
  };
}

/**
 * Stored notifications (friend requests, group membership). Created by other services after
 * their own write succeeded; creating one never fails the caller's action.
 * Events go only to the recipient's user:{id} room.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly realtimeService: RealtimeService,
  ) {}

  /** Stores one notification per recipient, then emits notification:new. Never throws. */
  async notify(recipientIds: Types.ObjectId[], input: NotifyInput) {
    // The actor is never notified about their own action
    const recipients = [
      ...new Map(
        recipientIds
          .filter((id) => !id.equals(input.actorId))
          .map((id) => [id.toString(), id]),
      ).values(),
    ];
    if (recipients.length === 0) return;

    try {
      const created = await this.notificationModel.insertMany(
        recipients.map((userId) => ({
          userId,
          type: input.type,
          actorId: input.actorId,
          conversationId: input.conversationId,
          groupName: input.groupName,
        })),
      );

      const [actor, unread] = await Promise.all([
        this.userModel
          .findById(input.actorId, ACTOR_FIELDS)
          .lean<NotificationActor>(),
        this.unreadCounts(recipients),
      ]);

      for (const doc of created) {
        const userId = doc.userId.toString();
        this.realtimeService.emitToUser(userId, 'notification:new', {
          notification: toNotificationPayload(doc, actor ?? null),
          unreadCount: unread.get(userId) ?? 0,
        });
      }
    } catch (err) {
      this.logger.error(
        `Không thể tạo thông báo ${input.type}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Deletes the recipient's friend_request notifications from this actor (the request was
   * accepted or declined), then emits notification:removed. Never throws.
   */
  async removeFriendRequestNotifications(
    userId: Types.ObjectId,
    actorId: Types.ObjectId,
  ) {
    try {
      const filter = { userId, actorId, type: 'friend_request' as const };
      const found = await this.notificationModel
        .find(filter, '_id')
        .lean<{ _id: Types.ObjectId }[]>();
      if (found.length === 0) return;

      const ids = found.map((doc) => doc._id);
      await this.notificationModel.deleteMany({ _id: { $in: ids }, userId });

      this.realtimeService.emitToUser(
        userId.toString(),
        'notification:removed',
        {
          notificationIds: ids.map((id) => id.toString()),
          unreadCount: await this.countUnread(userId),
        },
      );
    } catch (err) {
      this.logger.error(
        `Không thể xóa thông báo lời mời kết bạn: ${(err as Error).message}`,
      );
    }
  }

  async list(userId: string, dto: ListNotificationsDto) {
    const me = this.toObjectId(userId);
    const limit = dto.limit ?? NOTIFICATION_PAGE_SIZE;

    const filter: { userId: Types.ObjectId; _id?: { $lt: Types.ObjectId } } = {
      userId: me,
    };
    if (dto.before) {
      filter._id = { $lt: new Types.ObjectId(dto.before) };
    }

    // One extra to know whether an older page exists
    const docs = await this.notificationModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate<{ actorId: NotificationActor | null }>('actorId', ACTOR_FIELDS)
      .lean();

    const page = docs.slice(0, limit);
    return {
      items: page.map((doc) => toNotificationPayload(doc, doc.actorId)),
      hasMore: docs.length > limit,
    };
  }

  async getUnreadCount(userId: string) {
    return { unreadCount: await this.countUnread(this.toObjectId(userId)) };
  }

  async markAsRead(notificationId: string, userId: string) {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new BadRequestException('Notification ID không hợp lệ');
    }
    const me = this.toObjectId(userId);
    const filter = { _id: new Types.ObjectId(notificationId), userId: me };

    // Only an unread one changes (an earlier readAt is kept)
    const result = await this.notificationModel.updateOne(
      { ...filter, readAt: null },
      { $set: { readAt: new Date() } },
    );
    if (
      result.modifiedCount === 0 &&
      !(await this.notificationModel.exists(filter))
    ) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    const unreadCount = await this.countUnread(me);
    if (result.modifiedCount > 0) {
      this.realtimeService.emitToUser(userId, 'notification:read', {
        notificationId,
        unreadCount,
      });
    }
    return { unreadCount };
  }

  async markAllAsRead(userId: string) {
    const me = this.toObjectId(userId);

    const result = await this.notificationModel.updateMany(
      { userId: me, readAt: null },
      { $set: { readAt: new Date() } },
    );

    if (result.modifiedCount > 0) {
      this.realtimeService.emitToUser(userId, 'notification:read', {
        all: true,
        unreadCount: 0,
      });
    }
    return { unreadCount: 0 };
  }

  private countUnread(userId: Types.ObjectId) {
    return this.notificationModel.countDocuments({ userId, readAt: null });
  }

  // Unread count per recipient in one query
  private async unreadCounts(userIds: Types.ObjectId[]) {
    const rows = await this.notificationModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { userId: { $in: userIds }, readAt: null } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }

  private toObjectId(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }
    return new Types.ObjectId(userId);
  }
}
