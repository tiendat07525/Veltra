import api from './api';
import { UserSettings, UserSettingsPatch } from '@/types/settings';

export const settingsService = {
  async get(): Promise<UserSettings> {
    const res = await api.get('/settings');
    return res.data;
  },

  // Only the fields sent change; returns the full settings
  async update(patch: UserSettingsPatch): Promise<UserSettings> {
    const res = await api.patch('/settings', patch);
    return res.data;
  },

  async mute(conversationId: string): Promise<UserSettings> {
    const res = await api.put(`/settings/muted/${conversationId}`);
    return res.data;
  },

  async unmute(conversationId: string): Promise<UserSettings> {
    const res = await api.delete(`/settings/muted/${conversationId}`);
    return res.data;
  },
};
