import { api, setToken, refreshToken } from './api';
import { CurrentUserProfile } from '@/types/user';
import { CurrentSession } from '@/types/settings';

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

  async register(data: { username: string; email: string; password: string }): Promise<{ message: string; data: Record<string, unknown> }> {
    const res = await api.post('/auth/register', data);
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    } finally {
      setToken(null);
      if (typeof window !== 'undefined') {
        window.location.replace('/auth/login');
      }
    }
  },

  // Signs out every other session; this client gets a new access token (and refresh cookie)
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const res = await api.post('/auth/change-password', { currentPassword, newPassword });
    if (res.data.accessToken) {
      setToken(res.data.accessToken);
    }
    return { message: res.data.message };
  },

  async getSession(): Promise<CurrentSession> {
    const res = await api.get('/auth/session');
    return res.data;
  },

  async refreshSilent(): Promise<void> {
    try {
      await refreshToken();
    } catch {
      setToken(null);
    }
  }
};
