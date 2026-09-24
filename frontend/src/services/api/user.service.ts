import api from './api';
import { User, CurrentUserProfile } from '@/types/user';

export const userService = {
  /**
   * Lấy tất cả users
   * GET /users
   */
  async getUsers(): Promise<User[]> {
    const res = await api.get('/users');
    return res.data;
  },

  /**
   * Lấy user theo ID
   * GET /users/:id
   */
  async getUserById(id: string): Promise<User> {
    const res = await api.get(`/users/${id}`);
    return res.data;
  },

  /**
   * Cập nhật profile
   * PATCH /users/profile
   */
  async updateProfile(updates: Partial<CurrentUserProfile>): Promise<CurrentUserProfile> {
    const res = await api.patch('/users/profile', updates);
    return res.data;
  },
};
