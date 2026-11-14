import { UserBasicInfo } from './user';

export type ConversationType = 'direct' | 'group';

export type ConversationFilter = 'all' | 'direct' | 'groups' | 'unread';

export interface ConversationParticipant extends UserBasicInfo {
  joinedAt?: string;
}

export interface ConversationLastMessage {
  _id?: string;
  content?: string;
  senderId?: string | UserBasicInfo;
  createdAt?: string;
  seq?: number;
}

export interface ConversationGroup {
  name?: string;
  createdBy?: string;
}

export interface Conversation {
  _id: string;
  id?: string;
  name?: string;
  avatar?: string;
  description?: string;
  isMuted?: boolean;
  isPinned?: boolean;
  type: ConversationType;
  participants: ConversationParticipant[];
  group?: ConversationGroup;
  lastMessage?: ConversationLastMessage | null;
  lastMessageAt?: string;
  seenBy?: string[];
  // seq of the newest message (server-assigned)
  lastSeq?: number;
  // Computed by the server from lastSeq − lastReadSeq; never incremented or zeroed on the client
  unreadCounts?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
}
