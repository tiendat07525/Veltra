'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  // Shown on the left, inside the field
  icon?: React.ReactNode;
  // Red text below the field; nothing while empty
  error?: string | null;
  // Grey text below the field, replaced by error
  hint?: string;
}

// Password field with a show / hide button and the problem written below it
export const PasswordInput: React.FC<PasswordInputProps> = ({ icon, error, hint, className, ...props }) => {
  const [visible, setVisible] = useState(false);
  const noteId = useId();
  const note = error || hint;
  return (
    <div>
      <div className="relative">
        {icon}
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          autoCapitalize="none"
          spellCheck={false}
          className={cn(className, 'pr-11', 'aria-invalid:border-danger! aria-invalid:ring-danger/20!')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={props.disabled}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center rounded-r-xl text-fg-muted hover:text-fg disabled:opacity-60 transition-colors"
        >
          {visible ? (
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {note && (
        <p id={noteId} aria-live="polite" className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-fg-muted')}>
          {note}
        </p>
      )}
    </div>
  );
};
