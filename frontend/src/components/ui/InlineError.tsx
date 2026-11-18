'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineErrorProps {
  // Nothing is rendered while this is empty
  message: string | null | undefined;
  onDismiss?: () => void;
  className?: string;
}

// Error shown next to the control that failed (the app has no corner toasts).
// Stays until dismissed or replaced by the next attempt.
export const InlineError: React.FC<InlineErrorProps> = ({ message, onDismiss, className }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger',
        className
      )}
    >
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 min-w-0 break-words whitespace-pre-line leading-4">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng thông báo lỗi"
          className="shrink-0 -m-1 p-1 rounded-md hover:bg-danger/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
