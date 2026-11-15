import { useState, useMemo, useEffect, useRef } from 'react';
import { useConversations } from './use-conversations';
import { useMessages } from './use-messages';
import { usePresence } from './use-presence';
import { CurrentUserProfile } from '@/types/user';
import { ConversationParticipant } from '@/types/conversation';
import { authService } from '@/services/api/auth.service';

export function useChat(enabled: boolean = true, initialConversationId?: string) {
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState<boolean>(true);

  const conversationsHook = useConversations(enabled, currentUser?._id ?? null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId || null
  );

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  // Re-sync presence when conversations / members change (new co-members may be online)
  const presenceAudienceKey = useMemo(
    () =>
      conversationsHook.allConversations
        .map((c) => `${c._id}:${c.participants.length}`)
        .sort()
        .join(','),
    [conversationsHook.allConversations]
  );
  const presence = usePresence(enabled, currentUser?._id ?? null, presenceAudienceKey);

  // Switching conversation ends my typing state in the previous one
  const { stopTyping } = presence;
  useEffect(() => {
    stopTyping();
  }, [activeConversationId, stopTyping]);

  const messagesHook = useMessages(activeConversationId, (convId, upToSeq) => {
    if (currentUser?._id) {
      conversationsHook.markAsSeen(convId, currentUser._id, upToSeq);
    }
  }, enabled, currentUser?._id ?? null);

  const activeConversation = useMemo(() => {
    return (
      conversationsHook.allConversations.find(
        (c) => c._id === activeConversationId
      ) || null
    );
  }, [conversationsHook.allConversations, activeConversationId]);

  // The open conversation left the list (I left / was removed / it was deleted): close it.
  // Only once it has been seen in the list, so an id still being loaded is not cleared.
  const activeSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeConversation) {
      activeSeenRef.current = activeConversation._id;
    } else if (activeConversationId && activeSeenRef.current === activeConversationId) {
      activeSeenRef.current = null;
      setActiveConversationId(null);
    }
  }, [activeConversation, activeConversationId]);

  const { getConversationDisplayName } = conversationsHook;
  const activeConversationName = useMemo(() => {
    if (!activeConversation || !currentUser) return '';
    return getConversationDisplayName(activeConversation, currentUser._id);
  }, [activeConversation, currentUser, getConversationDisplayName]);

  const conversationPartner = useMemo((): ConversationParticipant | null => {
    if (!activeConversation || activeConversation.type !== 'direct' || !currentUser) return null;
    const partner = activeConversation.participants.find(
      (p) => p._id !== currentUser._id
    );
    return partner || null;
  }, [activeConversation, currentUser]);

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
    presence,
  };
}
