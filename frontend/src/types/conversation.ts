import { MessageType } from './message';

export type ConversationType = 'direct' | 'group';

export type ConversationFilter = 'all' | 'direct' | 'groups' | 'favorites' | 'unread';

export interface ConversationLastMessage {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  type: MessageType;
  isRead?: boolean;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  avatar: string;
  description?: string;
  participants: string[]; // user IDs
  admins?: string[]; // user IDs for group
  lastMessage?: ConversationLastMessage;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: string;
  updatedAt: string;
}
