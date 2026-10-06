import { api, setToken, refreshToken } from './api';
import { CurrentUserProfile } from '@/types/user';

export const authService = {
 
  async getCurrentUser(): Promise<CurrentUserProfile> {
    const res = await api.get('/users/profile');
    return res.data;
  },

  async login(credentials: { username: string; password: string }): Promise<{ message: string; accessToken: string }> {
    const res = await api.post('/auth/login', credentials);
    if (res.data.accessToken) {
      setToken(res.data.accessToken);
    }
    return res.data;
  },

  async register(data: { username: string; email: string; password: string }): Promise<{ message: string; data: any }> {
    const res = await api.post('/auth/register', data);
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors on logout
    } finally {
      setToken(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
    }
  },

  async refreshSilent(): Promise<void> {
    try {
      await refreshToken();
    } catch (e) {
      setToken(null);
    }
  }
};
