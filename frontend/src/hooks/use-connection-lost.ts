import { useEffect, useState } from 'react';

// Short drops (wifi change, server restart) reconnect before this and show nothing
const SHOW_AFTER_MS = 3000;

// True once the socket has been down for a while
export function useConnectionLost(isConnected: boolean): boolean {
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (isConnected) return;
    const timer = setTimeout(() => setWaited(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setWaited(false);
    };
  }, [isConnected]);

  return !isConnected && waited;
}
