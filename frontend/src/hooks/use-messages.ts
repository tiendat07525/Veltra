import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';
import { uuidv7 } from '@/lib/utils';

const SEND_MAX_RETRIES = 5;
const SEND_RETRY_BASE_MS = 1000; // waits 1, 2, 4, 8, 16 s between attempts

// Retry only when the server may not have stored the message: network error, timeout, 5xx.
// A 4xx means the request itself is rejected; resending it would fail the same way.
function isRetryableSendError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === undefined || status >= 500;
}

// Put a stored message into the list. The REST response and the `message:new` event carry the
// same message; whichever arrives first replaces the optimistic copy (same clientMsgId) in place,
// the other then replaces it with an identical copy. Messages without a match dedupe by _id.
function upsertMessage(list: Message[], msg: Message): Message[] {
  if (msg.clientMsgId) {
    const idx = list.findIndex((m) => m.clientMsgId === msg.clientMsgId);
    if (idx !== -1) {
      const next = list.slice();
      next[idx] = msg;
      return next;
    }
  }
  if (list.some((m) => String(m._id) === String(msg._id))) return list;
  return [...list, msg];
}

export function useMessages(
  conversationId: string | null,
  onMarkAsSeen?: (convId: string) => void,
  enabled: boolean = true,
  currentUserId: string | null = null
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const activeConvIdRef = useRef<string | null>(conversationId);
  const onMarkAsSeenRef = useRef(onMarkAsSeen);

  useEffect(() => {
    activeConvIdRef.current = conversationId;
    onMarkAsSeenRef.current = onMarkAsSeen;
  }, [conversationId, onMarkAsSeen]);

  const fetchMessages = useCallback(async () => {
    if (!enabled || !conversationId) {
      setMessages([]);
      setLoading(false);
      setNextCursor(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await messageService.getMessages(conversationId);
      setMessages(data.messages);
      setNextCursor(data.nextCursor);

      try {
        if (onMarkAsSeenRef.current) {
          onMarkAsSeenRef.current(conversationId);
        } else {
          await conversationService.markAsSeen(conversationId);
        }
      } catch {

      }
    } catch (err: unknown) {
      console.error('Lỗi khi lấy tin nhắn:', err);
      const apiErr = err as { response?: { data?: { message?: string } } };
      setError(apiErr?.response?.data?.message || 'Không thể tải tin nhắn');
    } finally {
      setLoading(false);
    }
  }, [conversationId, enabled]);

  useEffect(() => {
    if (enabled) {
      void Promise.resolve().then(() => {
        fetchMessages();
      });
    }
  }, [fetchMessages, enabled]);

  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: unknown }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      const currentConvId = activeConvIdRef.current;
      if (currentConvId && String(newMsg.conversationId) === String(currentConvId)) {
        setMessages((prev) => upsertMessage(prev, newMsg));

        try {
          if (onMarkAsSeenRef.current) {
            onMarkAsSeenRef.current(currentConvId);
          } else {
            conversationService.markAsSeen(currentConvId);
          }
        } catch {
          // Ignore
        }
      }
    };

    const handleRevokeMessageEvent = (payload: { messageId: string; conversationId: string; content: string; isRevoked: boolean }) => {
      const currentConvId = activeConvIdRef.current;
      if (currentConvId && String(payload.conversationId) === String(currentConvId)) {
        setMessages((prev) =>
          prev.map((m) =>
            String(m._id) === String(payload.messageId)
              ? { ...m, isRevoked: true, content: payload.content || 'Tin nhắn đã thu hồi' }
              : m
          )
        );
      }
    };

    socketService.on('message:new', handleNewMessage);
    socketService.on('message:revoked', handleRevokeMessageEvent);
    return () => {
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:revoked', handleRevokeMessageEvent);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!conversationId || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const data = await messageService.getMessages(conversationId, 50, nextCursor);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id)));
        const newOlder = data.messages.filter((m) => !existingIds.has(String(m._id)));
        return [...newOlder, ...prev];
      });
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      console.error('Lỗi khi tải thêm tin nhắn:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, nextCursor, loadingMore]);

  // Send one pending message, retrying with the same clientMsgId so the server stores it once
  const deliver = useCallback(async (pending: Message) => {
    const clientMsgId = pending.clientMsgId;
    if (!clientMsgId) return;

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await messageService.sendMessage({
          conversationId: pending.conversationId,
          content: pending.content ?? '',
          clientMsgId,
        });
        const saved = res.data;
        if (saved) {
          // Only swap the optimistic copy; after a conversation switch the list no longer holds it
          setMessages((prev) =>
            prev.some((m) => m.clientMsgId === clientMsgId) ? upsertMessage(prev, saved) : prev
          );
        }
        return;
      } catch (err: unknown) {
        if (!isRetryableSendError(err) || attempt >= SEND_MAX_RETRIES) {
          console.error('Lỗi khi gửi tin nhắn:', err);
          // Leave it alone if the socket event already brought the stored copy
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMsgId === clientMsgId && m.status === 'sending' ? { ...m, status: 'failed' } : m
            )
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_BASE_MS * 2 ** attempt));
      }
    }
  }, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!conversationId || !currentUserId || !text) return;

      const clientMsgId = uuidv7();
      const pending: Message = {
        _id: `pending:${clientMsgId}`,
        clientMsgId,
        conversationId,
        senderId: currentUserId,
        content: text,
        // Display only (date separator); the list is never sorted by this
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((prev) => [...prev, pending]);
      void deliver(pending);
    },
    [conversationId, currentUserId, deliver]
  );

  const handleRetryMessage = useCallback(
    (clientMsgId: string) => {
      const failed = messages.find((m) => m.clientMsgId === clientMsgId && m.status === 'failed');
      if (!failed) return;

      const pending: Message = { ...failed, status: 'sending' };
      setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? pending : m)));
      void deliver(pending);
    },
    [messages, deliver]
  );

  const handleRevokeMessage = useCallback(async (messageId: string) => {
    try {
      await messageService.revokeMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === messageId
            ? { ...m, isRevoked: true, content: 'Tin nhắn đã thu hồi' }
            : m
        )
      );
    } catch (err: unknown) {
      console.error('Lỗi khi thu hồi tin nhắn:', err);
      throw err;
    }
  }, []);

  return {
    messages,
    loading,
    error,
    nextCursor,
    loadingMore,
    sendMessage: handleSendMessage,
    retryMessage: handleRetryMessage,
    loadMore,
    refetch: fetchMessages,
    setMessages,
    revokeMessage: handleRevokeMessage,
  };
}
