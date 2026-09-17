import { User } from '@/types/user';
import { Conversation } from '@/types/conversation';
import { Message, MessageType, ReactionEmoji } from '@/types/message';
import { NotificationItem } from '@/types/notification';
import { MOCK_USERS, CURRENT_USER } from '@/data/mock/users';
import { MOCK_CONVERSATIONS } from '@/data/mock/conversations';
import { INITIAL_MESSAGES } from '@/data/mock/messages';
import { MOCK_NOTIFICATIONS } from '@/data/mock/notifications';

// In-memory state holding simulated database
let usersState: User[] = [...MOCK_USERS];
let conversationsState: Conversation[] = [...MOCK_CONVERSATIONS];
let messagesState: Message[] = [...INITIAL_MESSAGES];
let notificationsState: NotificationItem[] = [...MOCK_NOTIFICATIONS];

const delay = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getUsers(): Promise<User[]> {
  await delay(50);
  return [...usersState];
}

export async function getUser(userId: string): Promise<User | undefined> {
  await delay(50);
  if (userId === CURRENT_USER.id) return CURRENT_USER;
  return usersState.find((u) => u.id === userId);
}

export async function getConversations(): Promise<Conversation[]> {
  await delay(80);
  return [...conversationsState].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  await delay(60);
  return conversationsState.find((c) => c.id === id);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  await delay(80);
  return messagesState.filter((m) => m.conversationId === conversationId);
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  type?: MessageType;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  duration?: number;
  replyTo?: Message['replyTo'];
}): Promise<Message> {
  await delay(120);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newMessage: Message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    conversationId: params.conversationId,
    senderId: params.senderId,
    content: params.content,
    type: params.type || 'text',
    createdAt: timeStr,
    status: 'sent',
    reactions: [],
    replyTo: params.replyTo,
    mediaUrl: params.mediaUrl,
    fileName: params.fileName,
    fileSize: params.fileSize,
    fileType: params.fileType,
    duration: params.duration,
  };

  messagesState.push(newMessage);

  // Update conversation lastMessage
  const convIndex = conversationsState.findIndex((c) => c.id === params.conversationId);
  if (convIndex !== -1) {
    conversationsState[convIndex] = {
      ...conversationsState[convIndex],
      lastMessage: {
        id: newMessage.id,
        content: newMessage.content,
        senderId: newMessage.senderId,
        createdAt: newMessage.createdAt,
        type: newMessage.type,
        isRead: true,
      },
      updatedAt: now.toISOString(),
    };
  }

  return newMessage;
}

export async function updateMessage(messageId: string, newContent: string): Promise<Message | undefined> {
  await delay(70);
  const msgIndex = messagesState.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return undefined;

  messagesState[msgIndex] = {
    ...messagesState[msgIndex],
    content: newContent,
    isEdited: true,
  };

  return messagesState[msgIndex];
}

export async function deleteMessage(messageId: string): Promise<boolean> {
  await delay(70);
  const msgIndex = messagesState.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return false;

  messagesState[msgIndex] = {
    ...messagesState[msgIndex],
    content: 'This message was deleted.',
    isDeleted: true,
  };

  return true;
}

export async function togglePinMessage(messageId: string): Promise<boolean> {
  await delay(50);
  const msgIndex = messagesState.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return false;

  const current = !!messagesState[msgIndex].isPinned;
  messagesState[msgIndex] = {
    ...messagesState[msgIndex],
    isPinned: !current,
  };

  return !current;
}

export async function markAsRead(conversationId: string): Promise<void> {
  await delay(50);
  const convIndex = conversationsState.findIndex((c) => c.id === conversationId);
  if (convIndex !== -1) {
    conversationsState[convIndex] = {
      ...conversationsState[convIndex],
      unreadCount: 0,
    };
  }

  // mark messages as read
  messagesState = messagesState.map((m) =>
    m.conversationId === conversationId ? { ...m, status: 'read' as const } : m
  );
}

export async function toggleReaction(
  messageId: string,
  emoji: ReactionEmoji,
  userId: string = CURRENT_USER.id
): Promise<Message | undefined> {
  await delay(60);
  const msgIndex = messagesState.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return undefined;

  const msg = messagesState[msgIndex];
  const existingReactions = [...msg.reactions];
  const reactIndex = existingReactions.findIndex((r) => r.emoji === emoji);

  if (reactIndex !== -1) {
    const r = existingReactions[reactIndex];
    if (r.users.includes(userId)) {
      // remove reaction
      const newUsers = r.users.filter((u) => u !== userId);
      if (newUsers.length === 0) {
        existingReactions.splice(reactIndex, 1);
      } else {
        existingReactions[reactIndex] = {
          ...r,
          count: newUsers.length,
          users: newUsers,
        };
      }
    } else {
      // add user to reaction
      existingReactions[reactIndex] = {
        ...r,
        count: r.count + 1,
        users: [...r.users, userId],
      };
    }
  } else {
    // new emoji reaction
    existingReactions.push({
      emoji,
      count: 1,
      users: [userId],
    });
  }

  messagesState[msgIndex] = {
    ...msg,
    reactions: existingReactions,
  };

  return messagesState[msgIndex];
}

export async function searchMessages(query: string, conversationId?: string): Promise<Message[]> {
  await delay(100);
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return messagesState.filter((m) => {
    if (m.isDeleted) return false;
    if (conversationId && m.conversationId !== conversationId) return false;
    return m.content.toLowerCase().includes(q) || (m.fileName && m.fileName.toLowerCase().includes(q));
  });
}

export async function togglePinConversation(conversationId: string): Promise<boolean> {
  await delay(50);
  const conv = conversationsState.find((c) => c.id === conversationId);
  if (!conv) return false;
  conv.isPinned = !conv.isPinned;
  return conv.isPinned;
}

export async function toggleMuteConversation(conversationId: string): Promise<boolean> {
  await delay(50);
  const conv = conversationsState.find((c) => c.id === conversationId);
  if (!conv) return false;
  conv.isMuted = !conv.isMuted;
  return conv.isMuted;
}

export async function createConversation(params: {
  type: 'direct' | 'group';
  name: string;
  participants: string[];
  avatar?: string;
  description?: string;
}): Promise<Conversation> {
  await delay(100);
  const newConv: Conversation = {
    id: `conv-${Date.now()}`,
    type: params.type,
    name: params.name,
    avatar:
      params.avatar ||
      (params.type === 'group'
        ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80'
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'),
    participants: params.participants,
    admins: params.type === 'group' ? [params.participants[0]] : undefined,
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    description: params.description || (params.type === 'group' ? 'New team channel' : 'Direct encrypted chat'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  conversationsState.unshift(newConv);
  return newConv;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  await delay(60);
  return [...notificationsState];
}

export async function markNotificationAsRead(id: string): Promise<void> {
  notificationsState = notificationsState.map((n) =>
    n.id === id ? { ...n, isRead: true } : n
  );
}

export async function markAllNotificationsAsRead(): Promise<void> {
  notificationsState = notificationsState.map((n) => ({ ...n, isRead: true }));
}

export async function clearNotifications(): Promise<void> {
  notificationsState = [];
}
