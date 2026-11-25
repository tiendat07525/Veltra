import { useCallback, useEffect, useRef, useState } from 'react';
import { CurrentUserProfile, UserUpdatedEvent } from '@/types/user';
import { authService } from '@/services/api/auth.service';
import { socketService } from '@/services/socket/socket.service';

/**
 * The only copy of my profile. Read on `enabled`, on every socket connect (changes missed while
 * disconnected) and when `user:updated` says I changed it (also in another tab): the event has the
 * name and avatar only, so the whole profile is read again.
 */
export function useCurrentUser(enabled: boolean) {
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState(true);

  // Reads and saves are numbered; an answer older than the one shown is dropped
  const lastStarted = useRef(0);
  const shown = useRef(0);

  // A profile returned by the server outside this hook (a save): newer than any read still running
  const updateCurrentUser = useCallback((profile: CurrentUserProfile) => {
    shown.current = ++lastStarted.current;
    setCurrentUser(profile);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let myId: string | null = null;

    const load = async () => {
      const request = ++lastStarted.current;
      try {
        const me = await authService.getCurrentUser();
        if (cancelled || request < shown.current) return;
        shown.current = request;
        myId = me._id;
        setCurrentUser(me);
      } catch (err) {
        // The current copy stays; the next connect or event retries
        console.error('Lỗi khi lấy thông tin user hiện tại:', err);
      } finally {
        if (!cancelled) setCurrentUserLoading(false);
      }
    };
    const handleUserUpdated = (event: UserUpdatedEvent) => {
      // myId is unknown until the first read is done: that answer may be older than the event
      if (!myId || event?.user?._id === myId) void load();
    };
    const handleConnect = () => void load();

    socketService.on('user:updated', handleUserUpdated);
    socketService.on('connect', handleConnect);
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
      socketService.off('user:updated', handleUserUpdated);
      socketService.off('connect', handleConnect);
    };
  }, [enabled]);

  return { currentUser, currentUserLoading, updateCurrentUser };
}
