import { MOCK_USERS } from '@/data/mock/users';
import { User, CurrentUserProfile } from '@/types/user';

export const userService = {
  async getUsers(): Promise<User[]> {
    return MOCK_USERS;
  },

  async getUserById(id: string): Promise<User | undefined> {
    return MOCK_USERS.find((u) => u.id === id);
  },

  async updateProfile(updates: Partial<CurrentUserProfile>): Promise<CurrentUserProfile> {
    return {
      ...MOCK_USERS[0],
      ...updates,
    } as unknown as CurrentUserProfile;
  },
};
