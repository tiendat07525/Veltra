import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

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

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

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
