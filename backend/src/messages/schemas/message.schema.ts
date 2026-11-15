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
    ...(raw.type === 'system' && raw.system
      ? {
          type: 'system' as const,
          system: {
            action: raw.system.action,
            targetIds: (raw.system.targetIds ?? []).map((id) => id.toString()),
          },
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
