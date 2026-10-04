'use client';

import { useEffect, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';

export function useSocket(token?: string | null) {
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const authToken = token || localStorage.getItem('accessToken');

    if (!authToken) {
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    const socket = socketService.connect(undefined, authToken);

    if (socket) {
      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

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
