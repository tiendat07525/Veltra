import { Types } from 'mongoose';
import {
  ConversationDocument,
  computeSeenBy,
  computeUnreadCounts,
} from './schemas/conversation.schema';

// Public fields of other users embedded in conversation responses (data_model.md §1)
export const CONVERSATION_USER_FIELDS = 'username displayName avatarUrl';

export const conversationUserPopulate = () => [
  { path: 'participants.userId', select: CONVERSATION_USER_FIELDS },
  { path: 'lastMessage.senderId', select: CONVERSATION_USER_FIELDS },
];

// participants[].userId after populate(conversationUserPopulate())
interface PopulatedParticipant {
  userId?: {
    _id?: Types.ObjectId;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  } | null;
  joinedAt?: Date;
  lastReadSeq?: number;
}

const formatParticipant = (participant: PopulatedParticipant) => ({
  _id: participant.userId?._id,
  username: participant.userId?.username,
  displayName: participant.userId?.displayName,
  avatarUrl: participant.userId?.avatarUrl ?? null,
  joinedAt: participant.joinedAt,
  // Highest seq this member has read: the other members show it as "Đã xem" (message_logic.md §5)
  lastReadSeq: participant.lastReadSeq ?? 0,
});

// A populated conversation document as returned by the API (unread counts and seenBy computed)
export const formatConversation = (conversation: ConversationDocument) => {
  const object = conversation.toObject();

  const participants = (conversation.participants || []).map((participant) =>
    formatParticipant(participant as unknown as PopulatedParticipant),
  );

  return {
    ...object,
    participants,
    // toObject(): seenBy holds plain user objects, like the rest of the response
    seenBy: computeSeenBy(object),
    unreadCounts: computeUnreadCounts(conversation),
  };
};

// Same shape for a populated lean() result
export const formatLeanConversation = <
  T extends {
    participants?: unknown[];
    unreadCounts?: unknown;
    seenBy?: unknown;
    lastSeq?: number;
  },
>(
  conversation: T,
) => {
  const participants = (conversation.participants || []).map((participant) =>
    formatParticipant(participant as PopulatedParticipant),
  );

  return {
    ...conversation,
    participants,
    seenBy: computeSeenBy(conversation as Parameters<typeof computeSeenBy>[0]),
    unreadCounts: computeUnreadCounts(
      conversation as Parameters<typeof computeUnreadCounts>[0],
    ),
  };
};
