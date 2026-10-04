import api from './api';
import { FriendRequest, FriendRequestsResponse, FriendListResponse } from '@/types/friend';
import { UserBasicInfo } from '@/types/user';

export const friendService = {

  async sendFriendRequest(toUserId: string, message?: string): Promise<{ status: boolean; message: string; request: FriendRequest }> {
    const res = await api.post('/friend/request', { to: toUserId, message });
    return res.data;
  },

  async acceptFriendRequest(requestId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/request/${requestId}/accept`);
    return res.data;
  },

  async declineFriendRequest(requestId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/request/${requestId}/decline`);
    return res.data;
  },

  async removeFriend(friendId: string): Promise<{ status: boolean; message: string }> {
    const res = await api.post(`/friend/remove/${friendId}`);
    return res.data;
  },

  async getFriendRequests(): Promise<FriendRequestsResponse> {
    const res = await api.get('/friend/requests');
    return res.data;
  },

  async getFriends(): Promise<UserBasicInfo[]> {
    const res = await api.get('/friend');
    return res.data.friends || [];
  },
};
