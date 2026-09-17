import { MOCK_USERS } from './users';
import { User } from '@/types/user';

export interface ContactCategory {
  id: string;
  name: string;
  count: number;
}

export const getContacts = (): User[] => {
  return MOCK_USERS;
};
