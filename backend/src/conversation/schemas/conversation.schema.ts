import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({
  _id: false,
})
export class Participant {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Date,
    default: Date.now,
  })
  joinedAt: Date;

  @Prop({
    enum: ['admin', 'member'],
  })
  role: string;
}

//========================================================================================

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
@Schema({
  _id: false,
})
export class Group {
  @Prop({
    type: String,
    trim: true,
  })
  name?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  createdBy?: Types.ObjectId;
}

//========================================================================================

export const GroupSchema = SchemaFactory.createForClass(Group);
@Schema({
  _id: false,
})
export class LastMessage {
  @Prop({
    type: Types.ObjectId,
    ref: 'Message',
  })
  _id?: Types.ObjectId;

  @Prop({
    type: String,
    default: null,
  })
  content?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  senderId?: Types.ObjectId;

  @Prop({
    type: Date,
    default: null,
  })
  createdAt?: Date;
}

//=============================================================================================

export const LastMessageSchema = SchemaFactory.createForClass(LastMessage);
/**
 * Generates a deterministic canonical key for a direct conversation
 * between two distinct users regardless of participant ordering (minId:maxId).
 *
 * Enforces uniqueness at the database level when combined with a partial unique index.
 */
export function getDirectKey(
  userA: string | Types.ObjectId,
  userB: string | Types.ObjectId,
): string {
  const idA = userA.toString();
  const idB = userB.toString();
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

@Schema({
  timestamps: true,
})
export class Conversation {
  @Prop({
    type: String,
    enum: ['direct', 'group'],
    required: true,
  })
  type: 'direct' | 'group';

  @Prop({
    type: String,
    required: false,
    default: undefined,
  })
  directKey?: string;

  @Prop({
    type: [ParticipantSchema],
    required: true,
  })
  participants: Participant[];

  @Prop({
    type: GroupSchema,
  })
  group?: Group;

  @Prop({
    type: Date,
  })
  lastMessageAt?: Date;

  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: [],
  })
  seenBy: Types.ObjectId[];

  @Prop({
    type: LastMessageSchema,
    default: null,
  })
  lastMessage?: LastMessage | null;

  @Prop({
    type: Map,
    of: Number,
    default: {},
  })
  unreadCounts: Map<string, number>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 });

/**
 * Partial unique index for direct conversations:
 * Only documents where directKey is a string are indexed.
 * This guarantees that distinct pairs of users cannot have duplicate direct conversations,
 * while having zero impact on group conversations or legacy conversations without directKey.
 */
ConversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: { directKey: { $type: 'string' } },
  },
);
