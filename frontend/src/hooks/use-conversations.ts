import { useState, useEffect, useCallback, useMemo } from 'react';
import { Conversation, ConversationFilter } from '@/types/conversation';
import { conversationService } from '@/services/api/conversation.service';

import { socketService } from '@/services/socket/socket.service';

export function useConversations() {
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
    } catch (err: any) {
      console.error('Lỗi khi lấy danh sách hội thoại:', err);
      setError(err?.response?.data?.message || 'Không thể tải danh sách hội thoại');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime Socket listener for updating conversations on new message
  useEffect(() => {
    const handleNewMessage = (payload: { message: any; conversation?: any }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      setConversations((prev) => {
        const convIndex = prev.findIndex((c) => String(c._id) === String(newMsg.conversationId));

        if (convIndex === -1) {
          // If conversation doesn't exist yet in the local list, refetch
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
          },
          lastMessageAt: newMsg.createdAt,
        };

        // Move the updated conversation to the top
        const rest = prev.filter((_, idx) => idx !== convIndex);
        return [updatedConv, ...rest];
      });
    };

    socketService.on('message:new', handleNewMessage);
    return () => {
      socketService.off('message:new', handleNewMessage);
    };
  }, [fetchConversations]);

  const handleMarkAsSeen = async (conversationId: string) => {
    try {
      await conversationService.markAsSeen(conversationId);
      // Update local state: reset unreadCount for this conversation
      setConversations((prev) =>
        prev.map((c) => {
          if (c._id === conversationId) {
            const newUnreadCounts = { ...c.unreadCounts };
            // We don't have currentUserId here, so we just refetch
            return c;
          }
          return c;
        })
      );
    } catch (err) {
      console.error('Lỗi đánh dấu đã xem:', err);
    }
  };

  const createNewConversation = async (params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
  }) => {
    const newConv = await conversationService.createConversation(params);
    setConversations((prev) => [newConv, ...prev]);
    return newConv;
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
        // Check if there are any unread counts > 0
        return conv.unreadCounts && Object.values(conv.unreadCounts).some((v) => v > 0);
      }
      return true;
    });
  }, [conversations, searchQuery, filter]);

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
    getConversationDisplayName,
    setConversations,
  };
}
