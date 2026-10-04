import api from './api';
import { Message, MessagesResponse } from '@/types/message';

export const messageService = {

  async getMessages(conversationId: string, limit = 50, cursor?: string): Promise<MessagesResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const res = await api.get(`/conversation/${conversationId}/messages`, { params });
    return res.data;
  },

  async sendMessage(params: {
    conversationId?: string;
    receiverId?: string;
    content: string;
  }): Promise<{ success: boolean; message: string; data?: Message }> {
    const res = await api.post('/message/direct', params);
    return res.data;
  },

  async revokeMessage(messageId: string): Promise<{ success: boolean; message: string; data?: any }> {
    const res = await api.patch(`/message/${messageId}/revoke`);
    return res.data;
  },
};
