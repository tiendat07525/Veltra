import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { conversationService } from '@/services/api/conversation.service';
import { socketService } from '@/services/socket/socket.service';

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);

  const activeConvIdRef = useRef<string | null>(conversationId);
  activeConvIdRef.current = conversationId;

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

      // Mark as seen khi mở conversation
      try {
        await conversationService.markAsSeen(conversationId);
      } catch {
        // Ignore - non-critical
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

  // Realtime Socket listener for incoming new messages
  useEffect(() => {
    const handleNewMessage = (payload: { message: Message; conversation?: any }) => {
      const newMsg = payload?.message;
      if (!newMsg) return;

      const currentConvId = activeConvIdRef.current;
      // Only append if the message belongs to the currently active conversation
      if (currentConvId && String(newMsg.conversationId) === String(currentConvId)) {
        setMessages((prev) => {
          // Check for duplicate by _id
          const exists = prev.some((m) => String(m._id) === String(newMsg._id));
          if (exists) return prev;
          return [...prev, newMsg];
        });

        // Mark as seen on arrival
        try {
          conversationService.markAsSeen(currentConvId);
        } catch {
          // Ignore
        }
      }
    };

    socketService.on('message:new', handleNewMessage);
    return () => {
      socketService.off('message:new', handleNewMessage);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!conversationId || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const data = await messageService.getMessages(conversationId, 50, nextCursor);
      // Prepend older messages with deduplication
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

        // If backend returned the created message, append it immediately with deduplication
        if (res.data) {
          const sentMsg = res.data;
          setMessages((prev) => {
            const exists = prev.some((m) => String(m._id) === String(sentMsg._id));
            if (exists) return prev;
            return [...prev, sentMsg];
          });
        } else {
          // Fallback: fetch messages if data not returned
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
  };
}
