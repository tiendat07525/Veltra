import { useState, useMemo } from 'react';
import { useConversations } from './use-conversations';
import { useMessages } from './use-messages';
import { CURRENT_USER, MOCK_USERS } from '@/data/mock/users';
import { User } from '@/types/user';

export function useChat(initialConversationId?: string) {
  const conversationsHook = useConversations();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId || 'conv-1'
  );
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(false);
  const [searchInConversation, setSearchInConversation] = useState<string>('');

  const messagesHook = useMessages(activeConversationId);

  const activeConversation = useMemo(() => {
    return (
      conversationsHook.allConversations.find(
        (c) => c.id === activeConversationId
      ) || null
    );
  }, [conversationsHook.allConversations, activeConversationId]);

  // Map participant IDs to user objects
  const participantsMap = useMemo(() => {
    const map = new Map<string, User>();
    map.set(CURRENT_USER.id, CURRENT_USER);
    MOCK_USERS.forEach((u) => map.set(u.id, u));
    return map;
  }, []);

  const conversationPartner = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'direct') return null;
    const partnerId = activeConversation.participants.find(
      (id) => id !== CURRENT_USER.id
    );
    return partnerId ? participantsMap.get(partnerId) || null : null;
  }, [activeConversation, participantsMap]);

  return {
    ...conversationsHook,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    conversationPartner,
    participantsMap,
    currentUser: CURRENT_USER,
    showInfoPanel,
    setShowInfoPanel,
    toggleInfoPanel: () => setShowInfoPanel((prev) => !prev),
    searchInConversation,
    setSearchInConversation,
    messagesHook,
  };
}
