import { UserBasicInfo } from './user';


export interface FriendRequest {
  _id: string;
  // null when the referenced user was deleted (populate finds no document)
  from: string | UserBasicInfo | null;
  to: string | UserBasicInfo | null;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
}


export type FriendshipStatus =
  | 'none'           
  | 'friends'        
  | 'request_sent'   
  | 'request_received' 
  | 'self';         

export interface FriendRequestsResponse {
  success: boolean;
  sent: FriendRequest[];
  received: FriendRequest[];
}

export interface FriendListResponse {
  status: boolean;
  friends: UserBasicInfo[];
}
