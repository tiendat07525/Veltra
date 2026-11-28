import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

// Group change recorded as a system message (the actor is the message's senderId)
export type SystemAction =
  | 'member_left'
  | 'member_removed'
  | 'owner_transferred'
  | 'members_added'
  | 'group_renamed';

@Schema({ _id: false })
export class SystemEvent {
  @Prop({
    type: String,
    enum: [
      'member_left',
      'member_removed',
      'owner_transferred',
      'members_added',
      'group_renamed',
    ],
    required: true,
  })
  action: SystemAction;

  // Users the change applies to (removed / new owner / added); empty for member_left and group_renamed
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  targetIds: Types.ObjectId[];
}

export const SystemEventSchema = SchemaFactory.createForClass(SystemEvent);

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

// A file stored in Cloudinary (attachment.service.ts); checked against the real asset at send
@Schema({ _id: false })
export class Attachment {
  @Prop({
    type: String,
    enum: ['image', 'video', 'audio', 'file'],
    required: true,
  })
  kind: AttachmentKind;

  // Delivery URL built by the server (images: f_auto,q_auto, no EXIF)
  @Prop({ type: String, required: true })
  url: string;

  // veltra/{conversationId}/{uploaderId}/{uuid}[.ext]; server-only (never in API payloads)
  @Prop({ type: String, required: true })
  publicId: string;

  @Prop({ type: String, enum: ['image', 'video', 'raw'], required: true })
  resourceType: 'image' | 'video' | 'raw';

  @Prop({ type: String, required: true })
  format: string;

  @Prop({ type: Number, required: true })
  bytes: number;

  // Original file name for display / download (sanitized)
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  // Seconds (video / audio)
  @Prop({ type: Number })
  duration?: number;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

// What clients receive for an attachment (no publicId / resourceType)
export function toAttachmentPayload(attachment: Attachment) {
  return {
    kind: attachment.kind,
    url: attachment.url,
    name: attachment.name,
    format: attachment.format,
    bytes: attachment.bytes,
    ...(attachment.width ? { width: attachment.width } : {}),
    ...(attachment.height ? { height: attachment.height } : {}),
    ...(attachment.duration ? { duration: attachment.duration } : {}),
  };
}

// The only reactions a message can get (one per user per message)
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

@Schema({ _id: false })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: REACTION_EMOJIS, required: true })
  emoji: ReactionEmoji;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

// What clients receive for reactions: in the order they were made, userId as a string
export function toReactionsPayload(reactions?: Reaction[] | null) {
  return (reactions ?? []).map((r) => ({
    userId: r.userId.toString(),
    emoji: r.emoji,
  }));
}

@Schema({
  timestamps: true,
})
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  senderId: Types.ObjectId;

  @Prop({
    type: String,
    trim: true,
  })
  content?: string;

  @Prop({
    type: String,
  })
  imgUrl?: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  isPinned: boolean;

  @Prop({
    type: Boolean,
    default: false,
  })
  isRevoked: boolean;

  // Client-generated UUIDv7 that makes a retried send idempotent; absent on legacy messages
  @Prop({ type: String })
  clientMsgId?: string;

  // Per-conversation order, assigned by the server from conversation.lastSeq (1, 2, 3, ...).
  // The only ordering key: never sort messages by createdAt.
  @Prop({ type: Number })
  seq: number;

  // Absent on user messages (and every message stored before system messages existed) = 'text'
  @Prop({ type: String, enum: ['text', 'system'] })
  type?: 'text' | 'system';

  // Set only when type === 'system'; content holds the rendered sentence
  @Prop({ type: SystemEventSchema })
  system?: SystemEvent;

  // Absent on messages without files (and on revoked ones: the files are deleted)
  @Prop({ type: [AttachmentSchema], default: undefined })
  attachments?: Attachment[];

  // One entry per user who reacted, in reaction order; absent = none (also after a revoke).
  // Written only by MessageService.setReaction / revokeMessage (atomic updates).
  @Prop({ type: [ReactionSchema], default: undefined })
  reactions?: Reaction[];

  // +1 on every reaction change; clients keep the reactions with the highest version
  @Prop({ type: Number })
  reactionsVersion?: number;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Shape shared by the send / group-change REST responses and the `message:new` event
export function toMessagePayload(message: MessageDocument) {
  const raw = message.toObject ? message.toObject() : message;
  return {
    _id: raw._id.toString(),
    conversationId: raw.conversationId.toString(),
    senderId: raw.senderId.toString(),
    content: raw.content,
    ...(raw.clientMsgId ? { clientMsgId: raw.clientMsgId } : {}),
    ...(raw.attachments?.length
      ? { attachments: raw.attachments.map(toAttachmentPayload) }
      : {}),
    ...(raw.type === 'system' && raw.system
      ? {
          type: 'system' as const,
          system: {
            action: raw.system.action,
            targetIds: (raw.system.targetIds ?? []).map((id) => id.toString()),
          },
        }
      : {}),
    ...(raw.reactions?.length
      ? {
          reactions: toReactionsPayload(raw.reactions),
          reactionsVersion: raw.reactionsVersion ?? 0,
        }
      : {}),
    seq: raw.seq,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

MessageSchema.index({
  conversationId: 1,
  createdAt: -1,
});

// One stored message per (conversation, sender, clientMsgId), so a retried send never duplicates.
// Partial: legacy messages have no clientMsgId and stay out of the index (no backfill needed).
MessageSchema.index(
  { conversationId: 1, senderId: 1, clientMsgId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMsgId: { $type: 'string' } },
  },
);

// History pagination and the guarantee that a seq is used once per conversation.
// Not partial: queries that only sort by seq must be able to use it. Every message
// must have a seq before it is built (backfill runbook in data_model.md).
MessageSchema.index({ conversationId: 1, seq: 1 }, { unique: true });
