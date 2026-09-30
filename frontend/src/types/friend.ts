import { UserBasicInfo } from './user';


export interface FriendRequest {
  _id: string;
  from: string | UserBasicInfo;  
  to: string | UserBasicInfo;    
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
