'use client';

import { useEffect, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { getToken, onTokenChange } from '@/services/api/api';
import { authService } from '@/services/api/auth.service';

export function useSocket() {
  const [isConnected, setIsConnected] = useState<boolean>(() => socketService.isConnected());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Token expiry, logout or login elsewhere: on success the token listener reconnects, on failure it tears down
        void authService.refreshSilent();
      }
    };
    // Follows the in-memory access token: login / refresh connects, logout / failed refresh disconnects
    const syncWithToken = (token: string | null) => {
      if (token) {
        socketService.connect();
      } else {
        socketService.disconnect();
        setIsConnected(false);
      }
    };

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    if (getToken()) {
      socketService.connect();
    }
    const unsubscribe = onTokenChange(syncWithToken);

    return () => {
      unsubscribe();
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
    };
  }, []);

  return {
    isConnected,
    socketService,
  };
}
