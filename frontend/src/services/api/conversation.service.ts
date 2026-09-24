import api from './api';
import { Conversation } from '@/types/conversation';

export const conversationService = {
  /**
   * Lấy danh sách conversations
   * GET /conversation
   */
  async getConversations(): Promise<Conversation[]> {
    const res = await api.get('/conversation');
    return res.data.conversations || [];
  },

  /**
   * Tạo conversation mới
   * POST /conversation
   * Body: { type: 'direct'|'group', participants: string[], groupName?: string }
   */
  async createConversation(params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
  }): Promise<Conversation> {
    const res = await api.post('/conversation', params);
    return res.data.conversation;
  },

  /**
   * Đánh dấu đã xem
   * PATCH /conversation/:conversationId/seen
   */
  async markAsSeen(conversationId: string): Promise<any> {
    const res = await api.patch(`/conversation/${conversationId}/seen`);
    return res.data;
  },

  /**
   * Cập nhật conversation (group name)
   * PATCH /conversation/:conversationId
   */
  async updateConversation(conversationId: string, dto: { groupName: string }): Promise<Conversation> {
    const res = await api.patch(`/conversation/${conversationId}`, dto);
    return res.data;
  },

  /**
   * Thêm participants vào group
   * POST /conversation/:conversationId/participants
   */
  async addParticipants(conversationId: string, userIds: string[]): Promise<Conversation> {
    const res = await api.post(`/conversation/${conversationId}/participants`, { userIds });
    return res.data;
  },
};
