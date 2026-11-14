import api from './api';
import { Message, MessagesResponse } from '@/types/message';

// `api` has no default timeout; without one a hung send would never be retried
const SEND_TIMEOUT_MS = 15_000;

export const messageService = {

  async getMessages(conversationId: string, limit = 50, beforeSeq?: number): Promise<MessagesResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (beforeSeq !== undefined) params.beforeSeq = String(beforeSeq);
    const res = await api.get(`/conversation/${conversationId}/messages`, { params });
    return res.data;
  },

  async sendMessage(params: {
    conversationId?: string;
    receiverId?: string;
    content: string;
    clientMsgId: string;
  }): Promise<{ success: boolean; message: string; data?: Message }> {
    const res = await api.post('/message/direct', params, { timeout: SEND_TIMEOUT_MS });
    return res.data;
  },

  async revokeMessage(messageId: string): Promise<{ success: boolean; message: string; data?: { messageId: string; conversationId: string } }> {
    const res = await api.patch(`/message/${messageId}/revoke`);
    return res.data;
  },
};
