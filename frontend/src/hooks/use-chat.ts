import { useState, useMemo, useEffect } from 'react';
import { useConversations } from './use-conversations';
import { useMessages } from './use-messages';
import { User, CurrentUserProfile } from '@/types/user';
import { ConversationParticipant } from '@/types/conversation';
import { authService } from '@/services/api/auth.service';

export function useChat(initialConversationId?: string) {
  const conversationsHook = useConversations();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId || null
  );

  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const me = await authService.getCurrentUser();
        setCurrentUser(me);
      } catch (err) {
        console.error('Lỗi khi lấy thông tin user hiện tại:', err);
      } finally {
        setCurrentUserLoading(false);
      }
    }
    loadCurrentUser();
  }, []);

  const messagesHook = useMessages(activeConversationId);

  const activeConversation = useMemo(() => {
    return (
      conversationsHook.allConversations.find(
        (c) => c._id === activeConversationId
      ) || null
    );
  }, [conversationsHook.allConversations, activeConversationId]);

  // Get display name for active conversation
  const activeConversationName = useMemo(() => {
    if (!activeConversation || !currentUser) return '';
    return conversationsHook.getConversationDisplayName(activeConversation, currentUser._id);
  }, [activeConversation, currentUser, conversationsHook.getConversationDisplayName]);

  // Find the partner in a direct conversation
  const conversationPartner = useMemo((): ConversationParticipant | null => {
    if (!activeConversation || activeConversation.type !== 'direct' || !currentUser) return null;
    const partner = activeConversation.participants.find(
      (p) => p._id !== currentUser._id
    );
    return partner || null;
  }, [activeConversation, currentUser]);

  // Compute total unread count for all conversations
  const totalUnreadCount = useMemo(() => {
    if (!currentUser) return 0;
    return conversationsHook.allConversations.reduce((sum, c) => {
      const count = c.unreadCounts?.[currentUser._id] || 0;
      return sum + count;
    }, 0);
  }, [conversationsHook.allConversations, currentUser]);

  return {
    ...conversationsHook,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeConversationName,
    conversationPartner,
    currentUser,
    currentUserLoading,
    totalUnreadCount,
    messagesHook,
  };
}
