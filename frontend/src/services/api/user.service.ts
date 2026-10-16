import api from './api';
import { User, CurrentUserProfile } from '@/types/user';

export const userService = {

  async getUsers(params?: { page?: number; limit?: number; search?: string }): Promise<User[]> {
    const res = await api.get('/users', { params });
    if (Array.isArray(res.data)) {
      return res.data;
    }
    return res.data?.data ?? [];
  },

  async getUserById(id: string): Promise<User> {
    const res = await api.get(`/users/${id}`);
    return res.data;
  },

  async updateProfile(updates: Partial<CurrentUserProfile>): Promise<CurrentUserProfile> {
    const res = await api.patch('/users/profile', updates);
    return res.data;
  },
};
