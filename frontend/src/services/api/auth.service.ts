import api from './api';
import { CurrentUserProfile } from '@/types/user';

export const authService = {
  /**
   * Lấy profile user hiện tại
   * GET /users/profile
   */
  async getCurrentUser(): Promise<CurrentUserProfile> {
    const res = await api.get('/users/profile');
    return res.data;
  },

  /**
   * Đăng nhập
   * POST /auth/login
   * Body: { username: string, password: string }
   * Response: { message: string, accessToken: string }
   */
  async login(credentials: { username: string; password: string }): Promise<{ message: string; accessToken: string }> {
    const res = await api.post('/auth/login', credentials);
    if (res.data.accessToken) {
      localStorage.setItem('accessToken', res.data.accessToken);
    }
    return res.data;
  },

  /**
   * Đăng ký
   * POST /auth/register
   * Body: { username: string, email: string, password: string }
   * Response: { message: string, data: User }
   */
  async register(data: { username: string; email: string; password: string }): Promise<{ message: string; data: any }> {
    const res = await api.post('/auth/register', data);
    // Backend register does NOT return accessToken - user must login after registering
    return res.data;
  },

  /**
   * Đăng xuất (client-side only)
   */
  logout(): void {
    localStorage.removeItem('accessToken');
  },
};
