import api from './api';
import { User, CurrentUserProfile } from '@/types/user';

export const userService = {

  async getUsers(): Promise<User[]> {
    const res = await api.get('/users');
    return res.data;
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
