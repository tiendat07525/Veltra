export type UserStatus = 'Online' | 'Offline' | 'Unvailable' | 'online' | 'offline' | 'away';


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

export interface CurrentUserProfile extends User {
  email: string;
}
export interface UserBasicInfo {
  _id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}
