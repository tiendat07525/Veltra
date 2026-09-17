import { CURRENT_USER } from '@/data/mock/users';
import { CurrentUserProfile, User } from '@/types/user';

export const authService = {
  async getCurrentUser(): Promise<CurrentUserProfile> {
    return CURRENT_USER;
  },

  async login(credentials: { email: string; password?: string }): Promise<{ user: User; token: string }> {
    return {
      user: CURRENT_USER,
      token: 'mock-jwt-token-veltra-v1',
    };
  },

  async register(data: { fullName: string; email: string; password?: string }): Promise<{ user: User; token: string }> {
    return {
      user: CURRENT_USER,
      token: 'mock-jwt-token-veltra-v1',
    };
  },

  async logout(): Promise<void> {
    // Clean auth state
  },
};
