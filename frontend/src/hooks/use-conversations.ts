import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Conversation } from '@/types/conversation';
import {
  getConversations,
  togglePinConversation,
  toggleMuteConversation,
  markAsRead,
  createConversation as apiCreateConversation,
} from '@/lib/mock-api';

export type ConversationFilter = 'all' | 'direct' | 'groups' | 'favorites' | 'unread';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filter, setFilter] = useState<ConversationFilter>('all');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConversations();
      setConversations(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleTogglePin = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newPinned = await togglePinConversation(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: newPinned } : c))
    );
  };

  const handleToggleMute = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newMuted = await toggleMuteConversation(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isMuted: newMuted } : c))
    );
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await markAsRead(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const createNewConversation = async (params: {
    type: 'direct' | 'group';
    name: string;
    participants: string[];
    avatar?: string;
  }) => {
    const newConv = await apiCreateConversation(params);
    setConversations((prev) => [newConv, ...prev]);
    return newConv;
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // Search text match
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        conv.name.toLowerCase().includes(query) ||
        (conv.lastMessage && conv.lastMessage.content.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter category
      if (filter === 'direct') return conv.type === 'direct';
      if (filter === 'groups') return conv.type === 'group';
      if (filter === 'favorites') return conv.isPinned;
      if (filter === 'unread') return conv.unreadCount > 0;
      return true;
    });
  }, [conversations, searchQuery, filter]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [conversations]);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    loading,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    totalUnreadCount,
    refetch: fetchConversations,
    togglePin: handleTogglePin,
    toggleMute: handleToggleMute,
    markAsRead: handleMarkAsRead,
    createNewConversation,
  };
}
