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

  // Highest seq this member has read; only ever raised ($max). Unread = lastSeq − lastReadSeq.
  @Prop({
    type: Number,
    default: 0,
  })
  lastReadSeq: number;
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

  @Prop({
    type: Number,
  })
  seq?: number;
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

/**
 * Unread count per member, computed (never stored): max(0, lastSeq − lastReadSeq).
 * Accepts raw or populated participants (`userId` as an id or as a user object).
 */
export function computeUnreadCounts(conversation: {
  lastSeq?: number;
  participants?: {
    userId?: Types.ObjectId | { _id?: unknown } | null;
    lastReadSeq?: number;
  }[];
}): Record<string, number> {
  const lastSeq = conversation.lastSeq ?? 0;
  const counts: Record<string, number> = {};
  for (const participant of conversation.participants ?? []) {
    const user = participant.userId;
    const rawId = user instanceof Types.ObjectId ? user : user?._id;
    if (!(rawId instanceof Types.ObjectId)) continue;
    counts[rawId.toString()] = Math.max(
      0,
      lastSeq - (participant.lastReadSeq ?? 0),
    );
  }
  return counts;
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

  // seq of the newest message; incremented atomically inside the send transaction
  @Prop({
    type: Number,
    default: 0,
  })
  lastSeq: number;

  // RETIRED: no longer written or read; unread is computeUnreadCounts(). Kept until removed via the runbook.
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
