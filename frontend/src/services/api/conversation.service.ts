import api from './api';
import { Conversation } from '@/types/conversation';

export const conversationService = {

  async getConversations(): Promise<Conversation[]> {
    const res = await api.get('/conversation');
    return res.data.conversations || [];
  },

  async createConversation(params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
  }): Promise<Conversation> {
    const res = await api.post('/conversation', params);
    return res.data.conversation;
  },

  // upToSeq = highest seq on screen; the server never reads past it (or past lastSeq)
  async markAsSeen(
    conversationId: string,
    upToSeq?: number
  ): Promise<{ message?: string; myUnreadCount?: number; lastSeq?: number; lastReadSeq?: number }> {
    const res = await api.patch(
      `/conversation/${conversationId}/seen`,
      upToSeq !== undefined ? { upToSeq } : {}
    );
    return res.data;
  },

  async updateConversation(conversationId: string, dto: { groupName: string }): Promise<Conversation> {
    const res = await api.patch(`/conversation/${conversationId}`, dto);
    return res.data;
  },
  async addParticipants(conversationId: string, userIds: string[]): Promise<Conversation> {
    const res = await api.post(`/conversation/${conversationId}/participants`, { userIds });
    return res.data;
  },
  async deleteConversation(conversationId: string): Promise<void> {
    await api.delete(`/conversation/${conversationId}`);
  }
};
