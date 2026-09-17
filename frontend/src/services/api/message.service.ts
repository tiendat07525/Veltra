import {
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  toggleReaction,
  togglePinMessage,
  searchMessages,
} from '@/lib/mock-api';
import { Message, MessageType, ReactionEmoji } from '@/types/message';

export const messageService = {
  async getMessages(conversationId: string): Promise<Message[]> {
    return getMessages(conversationId);
  },

  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    content: string;
    type?: MessageType;
    mediaUrl?: string;
    fileName?: string;
    fileSize?: string;
    fileType?: string;
    duration?: number;
    replyTo?: Message['replyTo'];
  }): Promise<Message> {
    return sendMessage(params);
  },

  async updateMessage(messageId: string, newContent: string): Promise<Message | undefined> {
    return updateMessage(messageId, newContent);
  },

  async deleteMessage(messageId: string): Promise<boolean> {
    return deleteMessage(messageId);
  },

  async toggleReaction(messageId: string, emoji: ReactionEmoji, userId: string): Promise<Message | undefined> {
    return toggleReaction(messageId, emoji, userId);
  },

  async togglePin(messageId: string): Promise<boolean> {
    return togglePinMessage(messageId);
  },

  async searchMessages(query: string, conversationId?: string): Promise<Message[]> {
    return searchMessages(query, conversationId);
  },
};
