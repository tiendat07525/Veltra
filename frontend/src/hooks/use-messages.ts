import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';

export function useMessages(
  conversationId: string | null,
  onMarkAsSeen?: (convId: string) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);

  const activeConvIdRef = useRef<string | null>(conversationId);
  activeConvIdRef.current = conversationId;
  const onMarkAsSeenRef = useRef(onMarkAsSeen);
  onMarkAsSeenRef.current = onMarkAsSeen;

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
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
    } catch (err: any) {
      console.error('Lỗi khi lấy tin nhắn:', err);
      setError(err?.response?.data?.message || 'Không thể tải tin nhắn');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: any }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      const currentConvId = activeConvIdRef.current;
      if (currentConvId && String(newMsg.conversationId) === String(currentConvId)) {
        setMessages((prev) => {
          const exists = prev.some((m) => String(m._id) === String(newMsg._id));
          if (exists) return prev;
          return [...prev, newMsg];
        });

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
    } catch (err: any) {
      console.error('Lỗi khi tải thêm tin nhắn:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, nextCursor, loadingMore]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !content.trim() || sending) return;

      setSending(true);
      try {
        const res = await messageService.sendMessage({
          conversationId,
          content: content.trim(),
        });

        if (res.data) {
          const sentMsg = res.data;
          setMessages((prev) => {
            const exists = prev.some((m) => String(m._id) === String(sentMsg._id));
            if (exists) return prev;
            return [...prev, sentMsg];
          });
        } else {
          await fetchMessages();
        }
      } catch (err: any) {
        console.error('Lỗi khi gửi tin nhắn:', err);
        setError(err?.response?.data?.message || 'Không thể gửi tin nhắn');
      } finally {
        setSending(false);
      }
    },
    [conversationId, sending, fetchMessages]
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
    } catch (err: any) {
      console.error('Lỗi khi thu hồi tin nhắn:', err);
      throw err;
    }
  }, []);

  return {
    messages,
    loading,
    error,
    sending,
    nextCursor,
    loadingMore,
    sendMessage: handleSendMessage,
    loadMore,
    refetch: fetchMessages,
    setMessages,
    revokeMessage: handleRevokeMessage,
  };
}
