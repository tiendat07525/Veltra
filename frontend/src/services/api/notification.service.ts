import api from './api';
import { NotificationPage } from '@/types/notification';

export const notificationService = {
  // Newest first; `before` = id of the oldest notification already loaded
  async list(before?: string): Promise<NotificationPage> {
    const res = await api.get('/notification', { params: before ? { before } : undefined });
    return res.data;
  },

  async getUnreadCount(): Promise<number> {
    const res = await api.get('/notification/unread-count');
    return res.data.unreadCount;
  },

  async markAsRead(notificationId: string): Promise<number> {
    const res = await api.patch(`/notification/${notificationId}/read`);
    return res.data.unreadCount;
  },

  async markAllAsRead(): Promise<number> {
    const res = await api.patch('/notification/read-all');
    return res.data.unreadCount;
  },
};
