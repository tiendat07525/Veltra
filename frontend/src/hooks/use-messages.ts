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

// Put a stored message into the list. The list holds stored messages in ascending seq, then
// optimistic ones (no seq yet) at the end. The REST response and the `message:new` event carry the
// same message: whichever arrives first replaces the optimistic copy (same clientMsgId), the other
// replaces it again with an identical copy. The client never assigns seq, it only places by it.
function upsertMessage(list: Message[], msg: Message): Message[] {
  const isSame = (m: Message) =>
    String(m._id) === String(msg._id) || (!!msg.clientMsgId && m.clientMsgId === msg.clientMsgId);

  if (msg.seq === undefined) {
    const idx = list.findIndex(isSame);
    if (idx === -1) return [...list, msg];
    const next = list.slice();
    next[idx] = msg;
    return next;
  }

  const seq = msg.seq;
  const rest = list.filter((m) => !isSame(m));
  // Before the first message with a higher seq, or before the optimistic tail
  const at = rest.findIndex((m) => m.seq === undefined || m.seq > seq);
  return at === -1 ? [...rest, msg] : [...rest.slice(0, at), msg, ...rest.slice(at)];
}

export function useMessages(
  conversationId: string | null,
  onMarkAsSeen?: (convId: string, upToSeq?: number) => void,
  enabled: boolean = true,
  currentUserId: string | null = null
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
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
      setHasMore(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await messageService.getMessages(conversationId);
      setMessages(data.messages);
      setHasMore(data.hasMore);

      // Read up to the newest message now on screen
      const upToSeq = data.messages[data.messages.length - 1]?.seq;
      try {
        if (onMarkAsSeenRef.current) {
          onMarkAsSeenRef.current(conversationId, upToSeq);
        } else {
          await conversationService.markAsSeen(conversationId, upToSeq);
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
            onMarkAsSeenRef.current(currentConvId, newMsg.seq);
          } else {
            conversationService.markAsSeen(currentConvId, newMsg.seq);
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
    // The list is in ascending seq, so the first message with a seq is the oldest held
    const beforeSeq = messages.find((m) => m.seq !== undefined)?.seq;
    if (!conversationId || !hasMore || beforeSeq === undefined || loadingMore) return;

    setLoadingMore(true);
    try {
      const data = await messageService.getMessages(conversationId, 50, beforeSeq);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id)));
        const newOlder = data.messages.filter((m) => !existingIds.has(String(m._id)));
        return [...newOlder, ...prev];
      });
      setHasMore(data.hasMore);
    } catch (err: unknown) {
      console.error('Lỗi khi tải thêm tin nhắn:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messages, hasMore, loadingMore]);

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
    hasMore,
    loadingMore,
    sendMessage: handleSendMessage,
    retryMessage: handleRetryMessage,
    loadMore,
    refetch: fetchMessages,
    setMessages,
    revokeMessage: handleRevokeMessage,
  };
}
