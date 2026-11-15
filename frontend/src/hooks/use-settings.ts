'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { settingsService } from '@/services/api/settings.service';
import { DEFAULT_SETTINGS, UserSettings, UserSettingsPatch } from '@/types/settings';

const applyPatch = (current: UserSettings, patch: UserSettingsPatch): UserSettings => ({
  ...current,
  notifications: { ...current.notifications, ...patch.notifications },
  chat: { ...current.chat, ...patch.chat },
});

/**
 * The user's preferences. Instantiated once (VeltraClientApp). Defaults are used until the
 * server copy arrives; changes are optimistic and rolled back if the request fails.
 * settings:updated (other tabs / devices) and every reconnect replace the local copy.
 */
export function useSettings(enabled: boolean) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const load = useCallback(async () => {
    try {
      setSettings(await settingsService.get());
      setLoaded(true);
    } catch {
      // Keep the current copy; the next reconnect retries
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const handleUpdated = (event: { settings?: UserSettings }) => {
      if (event?.settings) setSettings(event.settings);
    };
    const handleConnect = () => void load();

    socketService.on('settings:updated', handleUpdated);
    socketService.on('connect', handleConnect);
    void Promise.resolve().then(load);
    return () => {
      socketService.off('settings:updated', handleUpdated);
      socketService.off('connect', handleConnect);
    };
  }, [enabled, load]);

  // Throws after rolling back, so the caller can show an error
  const update = useCallback(async (patch: UserSettingsPatch) => {
    const previous = settingsRef.current;
    setSettings(applyPatch(previous, patch));
    try {
      setSettings(await settingsService.update(patch));
    } catch (err) {
      setSettings(previous);
      throw err;
    }
  }, []);

  const setMuted = useCallback(async (conversationId: string, muted: boolean) => {
    const previous = settingsRef.current;
    const others = previous.mutedConversationIds.filter((id) => id !== conversationId);
    setSettings({
      ...previous,
      mutedConversationIds: muted ? [...others, conversationId] : others,
    });
    try {
      setSettings(
        await (muted ? settingsService.mute(conversationId) : settingsService.unmute(conversationId))
      );
    } catch (err) {
      setSettings(previous);
      throw err;
    }
  }, []);

  return { settings, loaded, update, setMuted };
}
