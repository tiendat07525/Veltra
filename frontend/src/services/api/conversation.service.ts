import {
  getConversations,
  getConversation,
  createConversation,
  togglePinConversation,
  toggleMuteConversation,
  markAsRead,
} from '@/lib/mock-api';
import { Conversation } from '@/types/conversation';

export const conversationService = {
  async getConversations(): Promise<Conversation[]> {
    return getConversations();
  },

  async getConversationById(id: string): Promise<Conversation | undefined> {
    return getConversation(id);
  },

  async createConversation(params: {
    type: 'direct' | 'group';
    name: string;
    participants: string[];
    avatar?: string;
    description?: string;
  }): Promise<Conversation> {
    return createConversation(params);
  },

  async togglePin(conversationId: string): Promise<boolean> {
    return togglePinConversation(conversationId);
  },

  async toggleMute(conversationId: string): Promise<boolean> {
    return toggleMuteConversation(conversationId);
  },

  async markAsRead(conversationId: string): Promise<void> {
    return markAsRead(conversationId);
  },
};
