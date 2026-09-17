import { useState, useEffect, useCallback, useRef } from 'react';
import { Message, MessageType, ReactionEmoji, ReplyPreviewData } from '@/types/message';
import {
  getMessages,
  sendMessage as apiSendMessage,
  updateMessage as apiUpdateMessage,
  deleteMessage as apiDeleteMessage,
  toggleReaction as apiToggleReaction,
  togglePinMessage as apiTogglePinMessage,
  markAsRead,
} from '@/lib/mock-api';
import { CURRENT_USER, MOCK_USERS } from '@/data/mock/users';

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [typingUser, setTypingUser] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<ReplyPreviewData | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const typingTimeoutRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getMessages(conversationId);
      setMessages(data);
      await markAsRead(conversationId);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    setReplyingTo(null);
    setEditingMessage(null);
    setIsTyping(false);
  }, [conversationId, fetchMessages]);

  // Simulated auto-reply generator to make the realtime chat feel alive!
  const triggerSimulatedReply = (convId: string, userText: string) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Pick partner name
    const partner = MOCK_USERS.find((u) => u.id !== CURRENT_USER.id) || MOCK_USERS[0];
    setTypingUser(partner.displayName.split(' ')[0]);

    // Show typing after 700ms
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(true);

      // Reply after 2000ms
      typingTimeoutRef.current = setTimeout(async () => {
        setIsTyping(false);

        const automatedResponses = [
          `That sounds like a great plan! Let me test the integration on our staging build.`,
          `Got it! I am reviewing the pull request right now, looking super solid.`,
          `Awesome, agreed. The micro-interactions and responsiveness feel so buttery smooth.`,
          `Thanks for the update Kai! I will verify the token synchronization right away.`,
          `Looks perfect! Let me ping the design team to take a quick glance as well.`,
          `I just checked the performance audit — 60fps steady with 0 jank! 🚀`,
        ];

        const randomReply =
          automatedResponses[Math.floor(Math.random() * automatedResponses.length)];

        const replyMsg = await apiSendMessage({
          conversationId: convId,
          senderId: partner.id,
          content: randomReply,
          type: 'text',
        });

        setMessages((prev) => [...prev, replyMsg]);
      }, 2200);
    }, 700);
  };

  const handleSendMessage = async (params: {
    content: string;
    type?: MessageType;
    mediaUrl?: string;
    fileName?: string;
    fileSize?: string;
    fileType?: string;
    duration?: number;
  }) => {
    if (!conversationId || (!params.content.trim() && !params.mediaUrl && !params.fileName)) return;

    // If editing
    if (editingMessage) {
      const updated = await apiUpdateMessage(editingMessage.id, params.content);
      if (updated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? updated : m))
        );
      }
      setEditingMessage(null);
      return;
    }

    // New message
    const newMsg = await apiSendMessage({
      conversationId,
      senderId: CURRENT_USER.id,
      content: params.content,
      type: params.type || 'text',
      mediaUrl: params.mediaUrl,
      fileName: params.fileName,
      fileSize: params.fileSize,
      fileType: params.fileType,
      duration: params.duration,
      replyTo: replyingTo || undefined,
    });

    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    // Trigger realistic typing & reply simulation
    if (params.type === 'text' || !params.type) {
      triggerSimulatedReply(conversationId, params.content);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: ReactionEmoji) => {
    const updated = await apiToggleReaction(messageId, emoji, CURRENT_USER.id);
    if (updated) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? updated : m))
      );
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const success = await apiDeleteMessage(messageId);
    if (success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, content: 'This message was deleted.' }
            : m
        )
      );
    }
  };

  const handleTogglePinMessage = async (messageId: string) => {
    const isPinned = await apiTogglePinMessage(messageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isPinned } : m))
    );
  };

  const handleStartReply = (msg: Message, senderName: string) => {
    setReplyingTo({
      id: msg.id,
      senderName,
      content: msg.type === 'image' ? 'Photo' : msg.type === 'file' ? (msg.fileName || 'File') : msg.content,
      type: msg.type,
    });
    setEditingMessage(null);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessage(msg);
    setReplyingTo(null);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
  };

  return {
    messages,
    loading,
    isTyping,
    typingUser,
    replyingTo,
    editingMessage,
    sendMessage: handleSendMessage,
    toggleReaction: handleToggleReaction,
    deleteMessage: handleDeleteMessage,
    togglePinMessage: handleTogglePinMessage,
    startReply: handleStartReply,
    cancelReply: handleCancelReply,
    startEdit: handleStartEdit,
    cancelEdit: handleCancelEdit,
    refetch: fetchMessages,
  };
}
