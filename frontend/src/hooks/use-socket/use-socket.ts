'use client';

import { useEffect, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { createSocketRecovery } from '@/services/socket/socket-recovery';
import { getToken, onTokenChange } from '@/services/api/api';
import { authService } from '@/services/api/auth.service';

const RETRY_GAP_MS = 3000;

export function useSocket() {
  const [isConnected, setIsConnected] = useState<boolean>(() => socketService.isConnected());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recovery = createSocketRecovery(() => authService.refreshSilent());

    const handleConnect = () => {
      recovery.connected();
      setIsConnected(true);
    };
    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      // Token expiry, logout or login elsewhere: on success the token listener reconnects, on 401 it tears down
      if (reason === 'io server disconnect') recovery.refused(true);
      else recovery.dropped();
    };
    // Refused by the server middleware (expired token, session gone, too many handshakes, Redis down)
    const handleConnectError = () => {
      if (socketService.isGivenUp()) recovery.refused();
    };
    // Back online / tab shown: do not sit out a long wait (at most once per RETRY_GAP_MS)
    let lastRetryAt = -Infinity;
    const retryNow = () => {
      if (document.visibilityState === 'hidden' || socketService.isConnected()) return;
      const now = Date.now();
      if (now - lastRetryAt < RETRY_GAP_MS) return;
      lastRetryAt = now;
      if (!recovery.retryNow()) socketService.retryNow();
    };
    // Follows the in-memory access token: login / refresh connects, logout / failed refresh disconnects
    const syncWithToken = (token: string | null) => {
      if (token) {
        socketService.connect();
      } else {
        recovery.stop();
        socketService.disconnect();
        setIsConnected(false);
      }
    };

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('connect_error', handleConnectError);
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', retryNow);
    if (getToken()) {
      socketService.connect();
    }
    const unsubscribe = onTokenChange(syncWithToken);

    return () => {
      unsubscribe();
      recovery.stop();
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', retryNow);
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('connect_error', handleConnectError);
    };
  }, []);

  return {
    isConnected,
    socketService,
  };
}
