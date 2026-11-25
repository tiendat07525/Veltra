import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useConversations } from './use-conversations';
import { useCurrentUser } from './use-current-user';
import { useMessages } from './use-messages';
import { usePresence } from './use-presence';
import { CurrentUserProfile } from '@/types/user';
import { ConversationParticipant } from '@/types/conversation';
import { updateParticipant } from '@/lib/conversation-list';

// mutedConversationIds (settings) are left out of totalUnreadCount (sidebar badge, tab title)
export function useChat(
  enabled: boolean = true,
  initialConversationId?: string,
  mutedConversationIds?: Set<string>
) {
  const { currentUser, currentUserLoading, updateCurrentUser: showProfile } = useCurrentUser(enabled);

  const conversationsHook = useConversations(enabled, currentUser?._id ?? null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId || null
  );

  // My profile from the server (re-read or saved): also my name / avatar in the member lists
  const { setConversations } = conversationsHook;
  const updateCurrentUser = useCallback(
    (profile: CurrentUserProfile) => {
      showProfile(profile);
      setConversations((prev) => updateParticipant(prev, profile));
    },
    [setConversations, showProfile]
  );

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
      if (mutedConversationIds?.has(c._id)) return sum;
      const count = c.unreadCounts?.[currentUser._id] || 0;
      return sum + count;
    }, 0);
  }, [conversationsHook.allConversations, currentUser, mutedConversationIds]);

  return {
    ...conversationsHook,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeConversationName,
    conversationPartner,
    currentUser,
    updateCurrentUser,
    currentUserLoading,
    totalUnreadCount,
    messagesHook,
    presence,
  };
}
