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
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  // Presence / typing (usePresence)
  typingUserIds?: string[];
  onTyping?: (conversationId: string) => void;
  onStopTyping?: () => void;
}

/**
 * Composer: text (Enter sends, Shift+Enter new line), files picked or pasted (checked with
 * classifyFile, at most MAX_ATTACHMENTS_PER_MESSAGE), typing signals and the "đang nhập…" line.
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  conversation,
  conversationName,
  onSendMessage,
  onShowToast,
  typingUserIds,
  onTyping,
  onStopTyping,
}) => {
  const [inputValue, setInputValue] = useState('');
  // Picked files belong to one conversation: switching conversation shows an empty selection
  const [selection, setSelection] = useState<{ conversationId: string | null; files: SelectedFile[] }>({
    conversationId: null,
    files: [],
  });
  const selectedFiles = selection.conversationId === conversation._id ? selection.files : [];
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
    for (const file of Array.from(list)) {
      if (current.length + added.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        onShowToast(`Tối đa ${MAX_ATTACHMENTS_PER_MESSAGE} file mỗi tin nhắn`, 'error');
        break;
      }
      const checked = classifyFile(file);
      if (!checked.ok) {
        onShowToast(checked.error, 'error');
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
    <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
      {typingText && (
        <p className="mb-1.5 px-1 text-[11px] italic text-slate-500 dark:text-slate-400 truncate" aria-live="polite">
          {typingText}
        </p>
      )}
      {selectedFiles.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {selectedFiles.map((f, i) => (
            <div
              key={`${f.file.name}-${f.file.lastModified}-${i}`}
              className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
              title={f.file.name}
            >
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1 text-slate-500">
                  <FileText className="w-5 h-5" />
                  <span className="w-full truncate text-center text-[9px]">{f.file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-rose-500"
                title="Bỏ file"
                aria-label={`Bỏ ${f.file.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
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
          className="p-2.5 rounded-xl text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
          title="Đính kèm file"
          aria-label="Đính kèm file"
        >
          <Paperclip className="w-4 h-4" />
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
            if (e.key === 'Enter' && !e.shiftKey) {
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
          placeholder="Nhập tin nhắn..."
          rows={1}
          className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-sky-500/50 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 transition-all disabled:opacity-60 resize-none overflow-y-auto"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() && selectedFiles.length === 0}
          className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Gửi tin nhắn"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
