import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export const NOTIFICATION_TYPES = [
  'friend_request', // actor sent me a friend request
  'friend_accepted', // actor accepted my friend request
  'group_added', // actor added me to a group (also at creation)
  'group_removed', // actor removed me from a group
  'group_owner', // actor made me the group owner
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Notifications are kept 30 days (TTL index on createdAt)
export const NOTIFICATION_TTL_SECONDS = 30 * 24 * 60 * 60;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  // Recipient
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: NOTIFICATION_TYPES, required: true })
  type: NotificationType;

  // User who caused it
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  // Group notifications only
  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  // Group name when the notification was created (a removed member can no longer read the group)
  @Prop({ type: String })
  groupName?: string;

  @Prop({ type: Date, default: null })
  readAt: Date | null;

  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// List newest first, paged by _id
NotificationSchema.index({ userId: 1, _id: -1 });
// Unread count
NotificationSchema.index({ userId: 1, readAt: 1 });
// Retention
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_SECONDS },
);
