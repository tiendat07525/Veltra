
export type ActiveTab = 'chat' | 'contacts' | 'notifications' | 'settings' | 'profile';

export interface SendMessagePayload {
  conversationId?: string;
  receiverId?: string;
  content: string;
}
