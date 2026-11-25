'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useConnectionLost } from '@/hooks/use-connection-lost';

// Shown while the socket is down: messages may be missing until it is back. Never blocks clicks.
export const ConnectionBanner: React.FC<{ isConnected: boolean }> = ({ isConnected }) => {
  if (!useConnectionLost(isConnected)) return null;
  return (
    <div className="absolute top-2 inset-x-4 z-30 flex justify-center pointer-events-none">
      <div
        role="status"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-danger-soft text-danger border border-line shadow-sm text-xs font-semibold"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Mất kết nối, đang kết nối lại…
      </div>
    </div>
  );
};
