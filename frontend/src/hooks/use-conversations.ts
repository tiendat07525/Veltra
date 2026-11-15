import { useState, useEffect, useCallback, useMemo } from 'react';
import { Conversation, ConversationFilter } from '@/types/conversation';
import { Message } from '@/types/message';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';

// Insert or replace a conversation from the server (conversation:updated or a group-change response).
// If the list already holds a newer message (higher lastSeq), keep its message fields and take
// only the membership / group fields from the incoming copy.
function upsertConversation(prev: Conversation[], incoming: Conversation): Conversation[] {
  const index = prev.findIndex((c) => c._id === incoming._id);
  if (index === -1) return [incoming, ...prev];

  const current = prev[index];
  const merged: Conversation =
    (current.lastSeq ?? 0) > (incoming.lastSeq ?? 0)
      ? {
          ...incoming,
          lastMessage: current.lastMessage,
          lastMessageAt: current.lastMessageAt,
          lastSeq: current.lastSeq,
          unreadCounts: current.unreadCounts,
        }
      : incoming;
  const next = [...prev];
  next[index] = merged;
  return next;
}

export function useConversations(enabled: boolean = true, currentUserId: string | null = null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filter, setFilter] = useState<ConversationFilter>('all');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationService.getConversations();
      setConversations(data);
    } catch (err: unknown) {
      console.error('Lỗi khi lấy danh sách hội thoại:', err);
      const errMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(errMsg || 'Không thể tải danh sách hội thoại');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void Promise.resolve().then(() => {
        fetchConversations();
      });
    }
  }, [fetchConversations, enabled]);

  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: Partial<Conversation> }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      setConversations((prev) => {
        const convIndex = prev.findIndex((c) => String(c._id) === String(newMsg.conversationId));

        if (convIndex === -1) {
          fetchConversations();
          return prev;
        }

        const targetConv = prev[convIndex];
        const updatedConv: Conversation = {
          ...targetConv,
          lastMessage: {
            _id: newMsg._id,
            content: newMsg.content,
            senderId: newMsg.senderId,
            createdAt: newMsg.createdAt,
            seq: newMsg.seq,
          },
          lastMessageAt: newMsg.createdAt,
          lastSeq: payload.conversation?.lastSeq ?? targetConv.lastSeq,
          unreadCounts: payload.conversation?.unreadCounts || targetConv.unreadCounts,
        };

        // Move the updated conversation to the top
        const rest = prev.filter((_, idx) => idx !== convIndex);
        return [updatedConv, ...rest];
      });
    };

    const handleRevokeMessageEvent = (payload: { messageId: string; conversationId: string; content: string; isRevoked: boolean }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (String(c._id) === String(payload.conversationId)) {
            if (c.lastMessage && String(c.lastMessage._id) === String(payload.messageId)) {
              return {
                ...c,
                lastMessage: {
                  ...c.lastMessage,
                  content: payload.content || 'Tin nhắn đã thu hồi',
                }
              };
            }
          }
          return c;
        })
      );
    };

    // Members, owner or name changed (also how a newly added member learns about the group)
    const handleConversationUpdated = (payload: { conversation?: Conversation }) => {
      const incoming = payload?.conversation;
      if (!incoming?._id) return;
      setConversations((prev) => upsertConversation(prev, incoming));
    };

    // I left, was removed, or the conversation was deleted
    const handleConversationRemoved = (payload: { conversationId?: string }) => {
      const removedId = payload?.conversationId;
      if (!removedId) return;
      setConversations((prev) => prev.filter((c) => c._id !== removedId));
    };

    socketService.on('message:new', handleNewMessage);
    socketService.on('message:revoked', handleRevokeMessageEvent);
    socketService.on('conversation:updated', handleConversationUpdated);
    socketService.on('conversation:removed', handleConversationRemoved);
    return () => {
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:revoked', handleRevokeMessageEvent);
      socketService.off('conversation:updated', handleConversationUpdated);
      socketService.off('conversation:removed', handleConversationRemoved);
    };
  }, [fetchConversations]);

  const handleMarkAsSeen = useCallback(async (conversationId: string, currentUserId?: string, upToSeq?: number) => {
    try {
      const res = await conversationService.markAsSeen(conversationId, upToSeq);
      // Use the count the server computed; skip it when it is older than what the list already holds
      const myUnreadCount = res.myUnreadCount;
      if (currentUserId && typeof myUnreadCount === 'number') {
        setConversations((prev) =>
          prev.map((c) => {
            if (c._id !== conversationId) return c;
            if (res.lastSeq !== undefined && c.lastSeq !== undefined && res.lastSeq < c.lastSeq) return c;
            return { ...c, unreadCounts: { ...c.unreadCounts, [currentUserId]: myUnreadCount } };
          })
        );
      }
    } catch (err) {
      console.error('Lỗi đánh dấu đã xem:', err);
    }
  }, []);

  const createNewConversation = async (params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
  }) => {
    const newConv = await conversationService.createConversation(params);
    setConversations((prev) => {
      if (prev.some((c) => c._id === newConv._id)) {
        return prev;
      }
      return [newConv, ...prev];
    });
    return newConv;
  };

  const deleteConversation = async (conversationId: string) => {
    await conversationService.deleteConversation(conversationId);
    setConversations((prev) => prev.filter((c) => c._id !== conversationId));
  };

  // Group management: each response is the stored group, applied the same way as conversation:updated
  const applyGroup = (conversation: Conversation) =>
    setConversations((prev) => upsertConversation(prev, conversation));

  const renameGroup = async (conversationId: string, groupName: string) =>
    applyGroup(await conversationService.updateConversation(conversationId, { groupName }));

  const addMembers = async (conversationId: string, userIds: string[]) =>
    applyGroup(await conversationService.addParticipants(conversationId, userIds));

  const removeMember = async (conversationId: string, userId: string) =>
    applyGroup(await conversationService.removeParticipant(conversationId, userId));

  const transferOwner = async (conversationId: string, userId: string) =>
    applyGroup(await conversationService.transferOwnership(conversationId, userId));

  const leaveGroup = async (conversationId: string) => {
    await conversationService.leaveGroup(conversationId);
    setConversations((prev) => prev.filter((c) => c._id !== conversationId));
  };

  // Helper to get display name for a conversation
  const getConversationDisplayName = useCallback(
    (conv: Conversation, currentUserId: string): string => {
      if (conv.type === 'group') {
        return conv.group?.name || 'Nhóm';
      }
      // Direct: find the other participant
      const other = conv.participants.find((p) => p._id !== currentUserId);
      return other?.displayName || other?.username || 'Người dùng';
    },
    []
  );

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const name = conv.group?.name || '';
        const participantNames = conv.participants
          .map((p) => p.displayName || '')
          .join(' ');
        const lastMsg = conv.lastMessage?.content || '';
        const matchesSearch =
          name.toLowerCase().includes(query) ||
          participantNames.toLowerCase().includes(query) ||
          lastMsg.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      if (filter === 'direct') return conv.type === 'direct';
      if (filter === 'groups') return conv.type === 'group';
      if (filter === 'unread') {
        // Only my own unread count (unreadCounts holds every member's)
        return !!currentUserId && (conv.unreadCounts?.[currentUserId] ?? 0) > 0;
      }
      return true;
    });
  }, [conversations, searchQuery, filter, currentUserId]);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    refetch: fetchConversations,
    markAsSeen: handleMarkAsSeen,
    createNewConversation,
    deleteConversation,
    renameGroup,
    addMembers,
    removeMember,
    transferOwner,
    leaveGroup,
    getConversationDisplayName,
    setConversations,
  };
}
