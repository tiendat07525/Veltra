'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { Message } from '@/types/message';

// Timing contract: see .claude/docs/date_logic.md §6 and realtime.md (presence / typing)
// Sender re-sends typing:start at most this often while the user keeps typing
const TYPING_START_INTERVAL_MS = 3000;
// Sender sends typing:stop after this much idle time
const TYPING_IDLE_MS = 3000;
// Receiver hides an indicator this long after the last typing event
const TYPING_DISPLAY_MS = 5000;
// After a rejected typing:start (e.g. RATE_LIMITED) allow a retry after this delay
const TYPING_RETRY_MS = 1000;

type Ack<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: { code: string; message: string } };

interface PresenceEvent {
  userId: string;
  status: 'online' | 'offline';
}

interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

/**
 * Online friends / co-members and who is typing where. Nothing is persisted:
 * the online list is fetched with `presence:sync` on every (re)connect and then
 * kept current by `presence` events.
 *
 * `audienceKey` changes when the set of friends / conversations may have changed,
 * so the online list is re-synced for new contacts.
 */
export function usePresence(enabled: boolean, currentUserId: string | null, audienceKey = '') {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  // conversationId -> userIds typing there (never includes me)
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string[]>>({});

  // ── receiving ──────────────────────────────────────────────────────────────
  const hideTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const applyTyping = useCallback((conversationId: string, userId: string, isTyping: boolean) => {
    setTypingByConversation((prev) => {
      const current = prev[conversationId] ?? [];
      const has = current.includes(userId);
      if (isTyping === has) return prev;
      const nextList = isTyping ? [...current, userId] : current.filter((id) => id !== userId);
      const next = { ...prev };
      if (nextList.length) next[conversationId] = nextList;
      else delete next[conversationId];
      return next;
    });
  }, []);

  // Shows / hides an indicator; a shown one hides itself TYPING_DISPLAY_MS after the last event
  const setTyping = useCallback(
    (conversationId: string, userId: string, isTyping: boolean) => {
      const key = `${conversationId}:${userId}`;
      const timers = hideTimersRef.current;
      const pending = timers.get(key);
      if (pending) {
        clearTimeout(pending);
        timers.delete(key);
      }
      if (isTyping) {
        timers.set(
          key,
          setTimeout(() => {
            timers.delete(key);
            applyTyping(conversationId, userId, false);
          }, TYPING_DISPLAY_MS)
        );
      }
      applyTyping(conversationId, userId, isTyping);
    },
    [applyTyping]
  );

  const sync = useCallback(async () => {
    const ack = await socketService.emitWithAck<Ack<{ online: string[] }>>('presence:sync');
    if (ack?.ok) setOnlineIds(new Set(ack.data.online));
  }, []);

  useEffect(() => {
    if (!enabled || !currentUserId) return;

    const handlePresence = (event: PresenceEvent) => {
      if (!event?.userId || event.userId === currentUserId) return;
      setOnlineIds((prev) => {
        const isOnline = prev.has(event.userId);
        if ((event.status === 'online') === isOnline) return prev;
        const next = new Set(prev);
        if (event.status === 'online') next.add(event.userId);
        else next.delete(event.userId);
        return next;
      });
    };
    const handleTyping = (event: TypingEvent) => {
      if (!event?.conversationId || !event.userId || event.userId === currentUserId) return;
      setTyping(event.conversationId, event.userId, !!event.isTyping);
    };
    // A delivered message ends that sender's indicator right away
    const handleNewMessage = (payload: { message?: Message }) => {
      const message = payload?.message;
      if (message?.conversationId && message.senderId) {
        setTyping(message.conversationId, message.senderId, false);
      }
    };
    const handleConnect = () => void sync();
    const handleDisconnect = () => {
      // Stale while disconnected; re-synced on connect
      setOnlineIds(new Set());
      setTypingByConversation({});
    };

    socketService.on('presence', handlePresence);
    socketService.on('typing', handleTyping);
    socketService.on('message:new', handleNewMessage);
    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    if (socketService.isConnected()) void Promise.resolve().then(sync);

    const hideTimers = hideTimersRef.current;
    return () => {
      socketService.off('presence', handlePresence);
      socketService.off('typing', handleTyping);
      socketService.off('message:new', handleNewMessage);
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      hideTimers.forEach((timer) => clearTimeout(timer));
      hideTimers.clear();
    };
  }, [enabled, currentUserId, sync, setTyping]);

  // New friend / conversation: they may be online already
  useEffect(() => {
    if (!enabled || !currentUserId || !audienceKey) return;
    if (socketService.isConnected()) void Promise.resolve().then(sync);
  }, [enabled, currentUserId, audienceKey, sync]);

  // ── sending ────────────────────────────────────────────────────────────────
  // The single conversation I am typing in (only one composer exists)
  const typingConvRef = useRef<string | null>(null);
  const lastStartAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const conversationId = typingConvRef.current;
    if (!conversationId) return;
    typingConvRef.current = null;
    lastStartAtRef.current = 0;
    void socketService.emitWithAck('typing:stop', { conversationId });
  }, []);

  // Call on every input change in the composer
  const notifyTyping = useCallback(
    (conversationId: string) => {
      if (typingConvRef.current && typingConvRef.current !== conversationId) stopTyping();

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);

      const now = Date.now();
      if (typingConvRef.current === conversationId && now - lastStartAtRef.current < TYPING_START_INTERVAL_MS) {
        return;
      }
      typingConvRef.current = conversationId;
      lastStartAtRef.current = now;
      void socketService.emitWithAck<Ack>('typing:start', { conversationId }).then((ack) => {
        if (ack && !ack.ok && typingConvRef.current === conversationId) {
          lastStartAtRef.current = Date.now() - TYPING_START_INTERVAL_MS + TYPING_RETRY_MS;
        }
      });
    },
    [stopTyping]
  );

  // Leaving the page / logging out ends my typing state
  useEffect(() => {
    if (!enabled) return;
    return () => stopTyping();
  }, [enabled, stopTyping]);

  const isOnline = useCallback((userId?: string | null) => !!userId && onlineIds.has(userId), [onlineIds]);

  return {
    onlineIds,
    isOnline,
    typingByConversation,
    notifyTyping,
    stopTyping,
  };
}

export type PresenceState = ReturnType<typeof usePresence>;
