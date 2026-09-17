export type UserStatus = 'online' | 'offline' | 'away';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  coverImage?: string;
  status: UserStatus;
  lastSeen?: string;
  bio?: string;
  email: string;
  phone?: string;
  role?: string;
  location?: string;
  joinedDate?: string;
}

export interface CurrentUserProfile extends User {
  settings: {
    theme: 'dark' | 'light' | 'system';
    soundEnabled: boolean;
    notificationsEnabled: boolean;
    readReceipts: boolean;
    activeStatusVisible: boolean;
    language: string;
  };
}
