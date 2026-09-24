export type UserStatus = 'Online' | 'Offline' | 'Unvailable' | 'online' | 'offline' | 'away';

// Matches backend User schema fields (returned by GET /users, GET /users/:id, populate)
export interface User {
  _id: string;
  id?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  bio?: string;
  role?: string;
  location?: string;
  status?: UserStatus | 'online' | 'offline' | 'away';
  onlineStatus?: UserStatus;
  lastSeen?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Returned by GET /users/profile (same as User but guaranteed to have email)
export interface CurrentUserProfile extends User {
  email: string;
}

// Lightweight user info returned by populate() calls (friend list, conversation participants)
export interface UserBasicInfo {
  _id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}
