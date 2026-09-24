import { UserBasicInfo } from './user';

// Matches backend FriendRequest schema
export interface FriendRequest {
  _id: string;
  from: string | UserBasicInfo;  // populated or just ID
  to: string | UserBasicInfo;    // populated or just ID
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
}

// Represents the relationship status between current user and another user
export type FriendshipStatus =
  | 'none'           // No relationship
  | 'friends'        // Already friends
  | 'request_sent'   // Current user sent a request
  | 'request_received' // Current user received a request
  | 'self';          // Same user

export interface FriendRequestsResponse {
  success: boolean;
  sent: FriendRequest[];
  received: FriendRequest[];
}

export interface FriendListResponse {
  status: boolean;
  friends: UserBasicInfo[];
}
