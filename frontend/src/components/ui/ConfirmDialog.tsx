'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { InlineError } from '@/components/ui/InlineError';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  // Rejects with an Error whose message is shown in the dialog (the dialog stays open)
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

// Confirmation for a destructive action. Closes only after onConfirm succeeds.
// The body mounts on each open, so busy / error start fresh.
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open, ...props }) => {
  if (!open || typeof document === 'undefined') return null;
  return <ConfirmDialogBody {...props} />;
};

const ConfirmDialogBody: React.FC<Omit<ConfirmDialogProps, 'open'>> = ({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Thao tác thất bại, thử lại sau');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface border border-line p-5 shadow-2xl"
      >
        <h3 id="confirm-dialog-title" className="text-base font-bold text-fg mb-2">
          {title}
        </h3>
        <div id="confirm-dialog-desc" className="text-xs text-fg-muted leading-5 mb-4 break-words">
          {description}
        </div>
        <InlineError message={error} className="mb-4" />
        <div className="flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-10 px-4 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-50 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="min-h-10 min-w-20 px-4 flex items-center justify-center text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Đang xử lý" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
