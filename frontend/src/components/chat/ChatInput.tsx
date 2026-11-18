'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Send, X } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { AttachmentKind } from '@/types/message';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS_PER_MESSAGE,
  classifyFile,
} from '@/services/api/attachment.service';
import { InlineError } from '@/components/ui/InlineError';

// A file picked in the composer, not sent yet
interface SelectedFile {
  file: File;
  kind: AttachmentKind;
  previewUrl?: string;
}

interface ChatInputProps {
  conversation: Conversation;
  conversationName: string;
  // files: already checked with classifyFile
  onSendMessage: (content: string, files: File[]) => void;
  // Presence / typing (usePresence)
  typingUserIds?: string[];
  onTyping?: (conversationId: string) => void;
  onStopTyping?: () => void;
  // Settings: true → Enter sends (Shift+Enter new line); false → Ctrl/⌘+Enter sends
  enterToSend?: boolean;
}

/**
 * Composer: text (Enter or Ctrl/⌘+Enter sends, see enterToSend), files picked or pasted (checked with
 * classifyFile, at most MAX_ATTACHMENTS_PER_MESSAGE), typing signals and the "đang nhập…" line.
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  conversation,
  conversationName,
  onSendMessage,
  typingUserIds,
  onTyping,
  onStopTyping,
  enterToSend = true,
}) => {
  const [inputValue, setInputValue] = useState('');
  // Picked files belong to one conversation: switching conversation shows an empty selection
  const [selection, setSelection] = useState<{ conversationId: string | null; files: SelectedFile[] }>({
    conversationId: null,
    files: [],
  });
  const selectedFiles = selection.conversationId === conversation._id ? selection.files : [];
  // Rejected files (too many / type / size), shown above the composer of that conversation
  const [fileError, setFileError] = useState<{ conversationId: string; message: string } | null>(null);
  const fileErrorMessage = fileError?.conversationId === conversation._id ? fileError.message : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation]);

  const revokePreviews = (files: SelectedFile[]) =>
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));

  const addFiles = (list: FileList | File[]) => {
    const current = selectedFiles;
    if (selection.conversationId !== conversation._id) revokePreviews(selection.files);
    const added: SelectedFile[] = [];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      if (current.length + added.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        errors.push(`Tối đa ${MAX_ATTACHMENTS_PER_MESSAGE} file mỗi tin nhắn`);
        break;
      }
      const checked = classifyFile(file);
      if (!checked.ok) {
        errors.push(checked.error);
        continue;
      }
      added.push({
        file,
        kind: checked.kind,
        previewUrl: checked.kind === 'image' ? URL.createObjectURL(file) : undefined,
      });
    }
    if (added.length) {
      setSelection({ conversationId: conversation._id, files: [...current, ...added] });
    }
    // Each pick replaces the previous error (or clears it when every file was accepted)
    setFileError(errors.length ? { conversationId: conversation._id, message: errors.join('\n') } : null);
  };

  const removeFile = (index: number) => {
    revokePreviews(selectedFiles.slice(index, index + 1));
    setSelection((prev) => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }));
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text && selectedFiles.length === 0) return;
    onSendMessage(text, selectedFiles.map((f) => f.file));
    // The message makes its own previews; the composer's are no longer shown
    revokePreviews(selectedFiles);
    setSelection({ conversationId: null, files: [] });
    setFileError(null);
    setInputValue('');
    onStopTyping?.();
  };

  const typingText = (() => {
    if (!typingUserIds?.length) return null;
    if (conversation.type !== 'group') return `${conversationName} đang nhập…`;
    const names = typingUserIds.map((id) => {
      const p = conversation.participants.find((m) => m._id === id);
      return p?.displayName || p?.username || 'Ai đó';
    });
    return names.length > 2
      ? `${names[0]}, ${names[1]} và ${names.length - 2} người khác đang nhập…`
      : `${names.join(' và ')} đang nhập…`;
  })();

  return (
    <div className="px-3 sm:px-4 py-3 border-t border-line bg-surface shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {typingText && (
        <p className="mb-1.5 px-1 text-[11px] italic text-fg-muted truncate" aria-live="polite">
          {typingText}
        </p>
      )}
      <InlineError message={fileErrorMessage} onDismiss={() => setFileError(null)} className="mb-2" />
      {selectedFiles.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {selectedFiles.map((f, i) => (
            <div
              key={`${f.file.name}-${f.file.lastModified}-${i}`}
              className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-line bg-surface-2"
              title={f.file.name}
            >
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1 text-fg-muted">
                  <FileText className="w-5 h-5" />
                  <span className="w-full truncate text-center text-[9px]">{f.file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0.5 right-0.5 p-1 rounded-full bg-black/60 text-white hover:bg-red-600"
                title="Bỏ file"
                aria-label={`Bỏ ${f.file.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // Same file can be picked again after removing it
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-fg-muted hover:text-accent hover:bg-accent-soft transition-colors"
          title="Đính kèm file"
          aria-label="Đính kèm file"
        >
          <Paperclip className="w-5 h-5" aria-hidden="true" />
        </button>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (e.target.value.trim()) onTyping?.(conversation._id);
            else onStopTyping?.();
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            const sends = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
            if (sends) {
              e.preventDefault();
              handleSend();
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
              }
            }
          }}
          onBlur={() => onStopTyping?.()}
          onPaste={(e) => {
            // Pasted images / files become attachments; plain text pastes as usual
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          placeholder={enterToSend ? 'Nhập tin nhắn...' : 'Nhập tin nhắn... (Ctrl+Enter để gửi)'}
          rows={1}
          aria-label="Nội dung tin nhắn"
          className="flex-1 min-w-0 px-4 py-2.5 bg-surface-2 border border-transparent focus:border-primary/50 rounded-xl text-xs text-fg placeholder:text-fg-muted focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60 resize-none overflow-y-auto"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() && selectedFiles.length === 0}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-on-primary transition-colors"
          title="Gửi tin nhắn"
          aria-label="Gửi tin nhắn"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
