import { Conversation, ConversationFilter } from './conversation';
import { Message, ReactionEmoji } from './message';
import { User } from './user';

export type ActiveTab = 'chat' | 'contacts' | 'notifications' | 'settings' | 'profile';

export interface ActiveCallState {
  type: 'voice' | 'video';
  contactName: string;
  contactAvatar: string;
}

export interface SendMessagePayload {
  conversationId?: string;
  content: string;
  type?: 'text' | 'image' | 'file' | 'audio';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  duration?: number;
}

export interface ChatState {
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  partner: User | null;
  conversations: Conversation[];
  allConversations: Conversation[];
  messages: Message[];
  loadingMessages: boolean;
  isTyping: boolean;
  typingUser: string;
  filter: ConversationFilter;
  searchQuery: string;
}
