import api from './api';
import { FriendRequest, FriendRequestsResponse, FriendListResponse } from '@/types/friend';
import { UserBasicInfo } from '@/types/user';

export const friendService = {
  /**
   * Gửi lời mời kết bạn
   * POST /friend/request
   * Body: { to: string, message?: string }
   */
  async sendFriendRequest(toUserId: string, message?: string): Promise<{ status: boolean; message: string; request: FriendRequest }> {
    const res = await api.post('/friend/request', { to: toUserId, message });
    return res.data;
  },

  /**
   * Chấp nhận lời mời kết bạn
   * POST /friend/request/:requestId/accept
   */
  async acceptFriendRequest(requestId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/request/${requestId}/accept`);
    return res.data;
  },

  /**
   * Từ chối lời mời kết bạn
   * POST /friend/request/:requestId/decline
   */
  async declineFriendRequest(requestId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/request/${requestId}/decline`);
    return res.data;
  },

  /**
   * Xóa bạn
   * POST /friend/remove/:friendId
   */
  async removeFriend(friendId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/remove/${friendId}`);
    return res.data;
  },

  /**
   * Lấy danh sách lời mời kết bạn (đã gửi + đã nhận)
   * GET /friend/requests
   */
  async getFriendRequests(): Promise<FriendRequestsResponse> {
    const res = await api.get('/friend/requests');
    return res.data;
  },

  /**
   * Lấy danh sách bạn bè
   * GET /friend
   */
  async getFriends(): Promise<UserBasicInfo[]> {
    const res = await api.get('/friend');
    return res.data.friends || [];
  },
};
