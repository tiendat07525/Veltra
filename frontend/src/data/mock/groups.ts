import { Conversation } from '@/types/conversation';
import { MOCK_CONVERSATIONS } from './conversations';

export const getGroups = (): Conversation[] => {
  return MOCK_CONVERSATIONS.filter((c) => c.type === 'group');
};
