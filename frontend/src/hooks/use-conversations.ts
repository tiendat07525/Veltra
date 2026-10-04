import { useState, useEffect, useCallback, useMemo } from 'react';
import { Conversation, ConversationFilter } from '@/types/conversation';
import { Message } from '@/types/message';
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

  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: any }) => {
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
          },
          lastMessageAt: newMsg.createdAt,
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

    socketService.on('message:new', handleNewMessage);
    socketService.on('message:revoked', handleRevokeMessageEvent);
    return () => {
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:revoked', handleRevokeMessageEvent);
    };
  }, [fetchConversations]);

  const handleMarkAsSeen = useCallback(async (conversationId: string, currentUserId?: string) => {
    try {
      await conversationService.markAsSeen(conversationId);
      if (currentUserId) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c._id === conversationId) {
              const newUnreadCounts = { ...c.unreadCounts };
              newUnreadCounts[currentUserId] = 0;
              return { ...c, unreadCounts: newUnreadCounts };
            }
            return c;
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
    deleteConversation,
    getConversationDisplayName,
    setConversations,
  };
}
