import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';
import {
  applyRevokes,
  mergeNewestPage,
  prependOlderPage,
  upsertMessage,
  withOutbox,
} from '@/lib/message-list';
import { useOutbox } from './use-outbox';

// Stored messages of one conversation. Replaced as a whole when another conversation is opened.
interface History {
  conversationId: string;
  // Ascending seq; also collects socket messages while the first page is loading
  messages: Message[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  // Message id -> text shown instead; applied to every response that arrives later
  revoked: ReadonlyMap<string, string>;
}

const NO_MESSAGES: Message[] = [];
const REVOKED_TEXT = 'Tin nhắn đã thu hồi';

export function useMessages(
  conversationId: string | null,
  onMarkAsSeen?: (convId: string, upToSeq?: number) => void,
  enabled: boolean = true,
  currentUserId: string | null = null
) {
  const [history, setHistory] = useState<History | null>(null);
  // Same value, readable by async steps and socket handlers between renders
  const historyRef = useRef<History | null>(null);
  // Grows with every load and every switch; a response of an older generation is dropped
  const generationRef = useRef(0);
  const nextGeneration = useCallback(() => ++generationRef.current, []);

  const onMarkAsSeenRef = useRef(onMarkAsSeen);
  useEffect(() => {
    onMarkAsSeenRef.current = onMarkAsSeen;
  }, [onMarkAsSeen]);

  const replaceHistory = useCallback((next: History | null) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  // Change the loaded history, only if it is the one of this conversation
  const updateHistory = useCallback(
    (convId: string, change: (h: History) => Partial<History>) => {
      const held = historyRef.current;
      if (held && held.conversationId === convId) replaceHistory({ ...held, ...change(held) });
    },
    [replaceHistory]
  );

  const addStored = useCallback(
    (message: Message) =>
      updateHistory(String(message.conversationId), (h) => ({
        messages: applyRevokes(upsertMessage(h.messages, message), h.revoked),
      })),
    [updateHistory]
  );

  // Optimistic messages of every conversation
  const { outbox, send, retry, settle, dropConversation } = useOutbox(addStored);

  const markSeen = useCallback((convId: string, upToSeq?: number) => {
    if (onMarkAsSeenRef.current) {
      onMarkAsSeenRef.current(convId, upToSeq);
    } else {
      void conversationService.markAsSeen(convId, upToSeq).catch(() => undefined);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    const generation = nextGeneration();
    if (!enabled || !conversationId) {
      replaceHistory(null);
      return;
    }

    const held = historyRef.current?.conversationId === conversationId ? historyRef.current : null;
    replaceHistory({
      conversationId,
      messages: held?.messages ?? NO_MESSAGES,
      loading: true,
      error: null,
      hasMore: false,
      loadingMore: false,
      revoked: held?.revoked ?? new Map(),
    });
    try {
      const data = await messageService.getMessages(conversationId);
      if (generation !== generationRef.current) return;
      settle(data.messages);
      updateHistory(conversationId, (h) => ({
        messages: applyRevokes(mergeNewestPage(h.messages, data.messages), h.revoked),
        hasMore: data.hasMore,
        loading: false,
      }));
    } catch (err: unknown) {
      if (generation !== generationRef.current) return;
      console.error('Lỗi khi lấy tin nhắn:', err);
      const apiErr = err as { response?: { data?: { message?: string } } };
      updateHistory(conversationId, () => ({
        loading: false,
        error: apiErr?.response?.data?.message || 'Không thể tải tin nhắn',
      }));
      return;
    }

    // Read up to the newest message now on screen
    const shown = historyRef.current?.messages ?? NO_MESSAGES;
    markSeen(conversationId, shown[shown.length - 1]?.seq);
  }, [conversationId, enabled, nextGeneration, replaceHistory, updateHistory, settle, markSeen]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchMessages();
    });
    return () => {
      cancelled = true;
      // Responses still on the way belong to the conversation being left
      nextGeneration();
    };
  }, [fetchMessages, nextGeneration]);

  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: unknown }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      // Own message, of any conversation: the optimistic copy is done
      settle([newMsg]);

      const held = historyRef.current;
      if (!held || String(newMsg.conversationId) !== held.conversationId) return;
      addStored(newMsg);
      // Not on screen yet while loading / on error: marked when the page is shown
      if (!held.loading && !held.error) markSeen(held.conversationId, newMsg.seq);
    };

    const handleRevoked = (payload: { messageId: string; conversationId: string; content: string; isRevoked: boolean }) => {
      updateHistory(String(payload.conversationId), (h) => {
        const revoked = new Map(h.revoked).set(String(payload.messageId), payload.content || REVOKED_TEXT);
        return { revoked, messages: applyRevokes(h.messages, revoked) };
      });
    };

    const handleRemoved = (payload: { conversationId: string }) => dropConversation(String(payload.conversationId));

    socketService.on('message:new', handleNewMessage);
    socketService.on('message:revoked', handleRevoked);
    socketService.on('conversation:removed', handleRemoved);
    return () => {
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:revoked', handleRevoked);
      socketService.off('conversation:removed', handleRemoved);
    };
  }, [addStored, updateHistory, settle, dropConversation, markSeen]);

  const loadMore = useCallback(async () => {
    const held = historyRef.current;
    if (!held || held.conversationId !== conversationId) return;
    // The list is in ascending seq, so the first message with a seq is the oldest held
    const beforeSeq = held.messages.find((m) => m.seq !== undefined)?.seq;
    if (!held.hasMore || held.loading || held.loadingMore || beforeSeq === undefined) return;

    const generation = generationRef.current;
    updateHistory(conversationId, () => ({ loadingMore: true }));
    try {
      const data = await messageService.getMessages(conversationId, 50, beforeSeq);
      if (generation !== generationRef.current) return;
      settle(data.messages);
      updateHistory(conversationId, (h) => ({
        messages: applyRevokes(prependOlderPage(h.messages, data.messages), h.revoked),
        hasMore: data.hasMore,
        loadingMore: false,
      }));
    } catch (err: unknown) {
      if (generation !== generationRef.current) return;
      console.error('Lỗi khi tải thêm tin nhắn:', err);
      updateHistory(conversationId, () => ({ loadingMore: false }));
    }
  }, [conversationId, updateHistory, settle]);

  const sendMessage = useCallback(
    (content: string, files: File[] = []) => {
      if (!conversationId || !currentUserId) return;
      send(conversationId, currentUserId, content, files);
    },
    [conversationId, currentUserId, send]
  );

  const revokeMessage = useCallback(
    async (messageId: string) => {
      const convId = historyRef.current?.conversationId;
      try {
        await messageService.revokeMessage(messageId);
      } catch (err: unknown) {
        console.error('Lỗi khi thu hồi tin nhắn:', err);
        throw err;
      }
      if (!convId) return;
      updateHistory(convId, (h) => {
        const revoked = new Map(h.revoked).set(messageId, REVOKED_TEXT);
        return { revoked, messages: applyRevokes(h.messages, revoked) };
      });
    },
    [updateHistory]
  );

  // Never the history of another conversation: after a switch it counts as loading until its own arrives
  const open = history && history.conversationId === conversationId ? history : null;
  const loading = enabled && !!conversationId && (!open || open.loading);
  const stored = open?.messages ?? NO_MESSAGES;
  const messages = useMemo(
    // Empty until the first page is there, so the list opens once, at its newest message
    () => (conversationId && !loading ? withOutbox(stored, outbox, conversationId) : NO_MESSAGES),
    [conversationId, loading, stored, outbox]
  );

  return {
    messages,
    loading,
    error: open?.error ?? null,
    hasMore: open?.hasMore ?? false,
    loadingMore: open?.loadingMore ?? false,
    sendMessage,
    retryMessage: retry,
    loadMore,
    refetch: fetchMessages,
    revokeMessage,
  };
}
