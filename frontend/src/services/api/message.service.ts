import api from './api';
import { Message, MessagesResponse } from '@/types/message';

export const messageService = {
  /**
   * Lấy tin nhắn của conversation (có hỗ trợ cursor pagination)
   * GET /conversation/:conversationId/messages?limit=50&cursor=...
   */
  async getMessages(conversationId: string, limit = 50, cursor?: string): Promise<MessagesResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const res = await api.get(`/conversation/${conversationId}/messages`, { params });
    return res.data;
  },

  /**
   * Gửi tin nhắn trực tiếp
   * POST /message/direct
   * Body: { conversationId?: string, receiverId?: string, content: string }
   */
  async sendMessage(params: {
    conversationId?: string;
    receiverId?: string;
    content: string;
  }): Promise<{ success: boolean; message: string; data?: Message }> {
    const res = await api.post('/message/direct', params);
    return res.data;
  },
};
