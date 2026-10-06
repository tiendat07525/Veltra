'use client';

import { useEffect, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { getToken } from '@/services/api/api';
import { authService } from '@/services/api/auth.service';

export function useSocket(token?: string | null) {
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const authToken = token || getToken();

    if (!authToken) {
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    const socket = socketService.connect(undefined, authToken);

    if (socket) {
      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = async (reason: string) => {
        setIsConnected(false);
        if (reason === 'io server disconnect') {
          try {
            await authService.refreshSilent();
            const newToken = getToken();
            if (newToken) {
              socketService.connect(undefined, newToken);
            }
          } catch (e) {
            // Let the application handle the auth drop
          }
        }
      };

      if (socket.connected) {
        setIsConnected(true);
      }

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }
  }, [token]);

  return {
    socket: socketService.getSocket(),
    isConnected,
    socketService,
  };
}
