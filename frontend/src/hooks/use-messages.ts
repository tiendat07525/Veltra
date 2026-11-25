import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';
import {
  applyRevokes,
  contiguousTop,
  hasGap,
  mergeBySeq,
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
const PAGE_SIZE = 50;
// Resync reads at most this many pages back from the newest message
const RESYNC_MAX_PAGES = 4;
// A gap is filled only if it is still there after this long (events may arrive out of order)
const GAP_WAIT_MS = 500;
// A response that no longer belongs to the open conversation
const STALE = new Error('stale');
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

  // Missed while disconnected ('reconnect') or on the way ('gap'): read history back from the newest
  // message until it meets what is held; after a reconnect also until it covers it, for missed revokes.
  // No loading state, and nothing is lost on failure. One run at a time; a call during one (or during
  // the first load) runs it once more afterwards.
  const resyncRef = useRef<{ running: boolean; again: 'reconnect' | 'gap' | null }>({ running: false, again: null });
  // `conversation:seq` after which the server itself has nothing: do not ask again for every message
  const knownGapRef = useRef('');
  const resync = useCallback(
    async (reason: 'reconnect' | 'gap') => {
      const state = resyncRef.current;
      let next: 'reconnect' | 'gap' | null = reason;
      while (next) {
        const history = historyRef.current;
        if (!history) return;
        if (state.running || history.loading) {
          if (state.again !== 'reconnect') state.again = next;
          return;
        }
        const convId = history.conversationId;
        const held = history.messages;
        const top = contiguousTop(held) ?? 0;
        const oldest = held[0]?.seq ?? 1;
        const lastHeld = held[held.length - 1]?.seq ?? 0;
        const target = next === 'reconnect' ? oldest : top + 1;
        const generation = generationRef.current;

        state.running = true;
        state.again = null;
        try {
          let fresh: Message[] = [];
          let hasMore = true;
          for (let pages = 0; pages < RESYNC_MAX_PAGES && hasMore; pages++) {
            const data = await messageService.getMessages(convId, PAGE_SIZE, fresh[0]?.seq);
            // Another conversation was opened, or this one reloaded: that load is enough
            if (generation !== generationRef.current) throw STALE;
            fresh = [...data.messages, ...fresh];
            hasMore = data.hasMore;
            if ((fresh[0]?.seq ?? 0) <= target) break;
          }
          settle(fresh);

          const freshFrom = fresh[0]?.seq ?? 1;
          if (freshFrom <= top + 1) {
            updateHistory(convId, (h) => ({
              messages: applyRevokes(mergeBySeq(h.messages, fresh), h.revoked),
              ...(freshFrom <= oldest ? { hasMore } : {}),
            }));
          } else {
            // Too far behind: keep only the newest pages, like opening the conversation again.
            // Older messages still on the way no longer fit in front of them.
            nextGeneration();
            updateHistory(convId, (h) => ({
              messages: applyRevokes(mergeNewestPage(h.messages, fresh), h.revoked),
              hasMore,
              loadingMore: false,
            }));
          }

          const shown = historyRef.current?.messages ?? NO_MESSAGES;
          if (hasGap(shown)) knownGapRef.current = `${convId}:${contiguousTop(shown)}`;
          const newest = shown[shown.length - 1]?.seq ?? 0;
          if (newest > lastHeld) markSeen(convId, newest);
        } catch (err: unknown) {
          // The next reconnect or message retries
          if (err !== STALE) console.error('Lỗi khi đồng bộ tin nhắn:', err);
        } finally {
          state.running = false;
        }
        next = state.again;
      }
    },
    [nextGeneration, updateHistory, settle, markSeen]
  );

  // A message never arrived (e.g. 7 after 5): ask for it, unless it comes by itself in a moment
  useEffect(() => {
    if (!history || history.loading || history.error || !hasGap(history.messages)) return;
    const gap = `${history.conversationId}:${contiguousTop(history.messages)}`;
    if (gap === knownGapRef.current) return;
    const timer = setTimeout(() => void resync('gap'), GAP_WAIT_MS);
    return () => clearTimeout(timer);
  }, [history, resync]);

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

    // Reconnected while this page was on the way: it may have been read before the socket was back
    if (resyncRef.current.again) void resync(resyncRef.current.again);
  }, [conversationId, enabled, nextGeneration, replaceHistory, updateHistory, settle, markSeen, resync]);

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

    const handleConnect = () => {
      if (historyRef.current?.error) void fetchMessages();
      else void resync('reconnect');
    };

    socketService.on('connect', handleConnect);
    socketService.on('message:new', handleNewMessage);
    socketService.on('message:revoked', handleRevoked);
    socketService.on('conversation:removed', handleRemoved);
    return () => {
      socketService.off('connect', handleConnect);
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:revoked', handleRevoked);
      socketService.off('conversation:removed', handleRemoved);
    };
  }, [addStored, updateHistory, settle, dropConversation, markSeen, fetchMessages, resync]);

  const loadMore = useCallback(async () => {
    const held = historyRef.current;
    if (!held || held.conversationId !== conversationId) return;
    // The list is in ascending seq, so the first message with a seq is the oldest held
    const beforeSeq = held.messages.find((m) => m.seq !== undefined)?.seq;
    if (!held.hasMore || held.loading || held.loadingMore || beforeSeq === undefined) return;

    const generation = generationRef.current;
    updateHistory(conversationId, () => ({ loadingMore: true }));
    try {
      const data = await messageService.getMessages(conversationId, PAGE_SIZE, beforeSeq);
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
