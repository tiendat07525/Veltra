import React, { useState, useRef, useEffect } from 'react';
import {
  Paperclip,
  Image as ImageIcon,
  Smile,
  Mic,
  Send,
  X,
  FileText,
  Camera,
  Film,
  Sparkles,
  StopCircle,
} from 'lucide-react';
import { ReplyPreviewData, Message } from '@/types/message';
import { EmojiPickerPopover } from './EmojiPickerPopover';

interface MessageComposerProps {
  onSendMessage: (params: {
    content: string;
    type?: 'text' | 'image' | 'file' | 'audio';
    mediaUrl?: string;
    fileName?: string;
    fileSize?: string;
    fileType?: string;
    duration?: number;
  }) => void;
  replyingTo: ReplyPreviewData | null;
  onCancelReply: () => void;
  editingMessage: Message | null;
  onCancelEdit: () => void;
  isGroup?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  isGroup = false,
}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<any>(null);

  // Sync editing text
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [editingMessage]);

  // Voice recording timer simulation
  useEffect(() => {
    if (isRecordingVoice) {
      setVoiceSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setVoiceSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecordingVoice]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim()) return;

    onSendMessage({
      content: text.trim(),
      type: 'text',
    });

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleFinishVoiceRecording = () => {
    setIsRecordingVoice(false);
    onSendMessage({
      content: `Voice message (${voiceSeconds}s)`,
      type: 'audio',
      duration: Math.max(voiceSeconds, 4),
    });
    setVoiceSeconds(0);
  };

  const handleCancelVoiceRecording = () => {
    setIsRecordingVoice(false);
    setVoiceSeconds(0);
  };

  // Mock File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    if (isImg) {
      const reader = new FileReader();
      reader.onload = () => {
        onSendMessage({
          content: 'Photo',
          type: 'image',
          mediaUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage({
        content: file.name,
        type: 'file',
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        fileType: file.type,
      });
    }
    setShowAttachmentMenu(false);
    e.target.value = '';
  };

  // Quick Mock Send Presets
  const sendPresetImage = (url: string) => {
    onSendMessage({
      content: 'Shared image',
      type: 'image',
      mediaUrl: url,
    });
    setShowAttachmentMenu(false);
  };

  const sendPresetDocument = () => {
    onSendMessage({
      content: 'Veltra-Architecture-Spec-v2.pdf',
      type: 'file',
      fileName: 'Veltra-Architecture-Spec-v2.pdf',
      fileSize: '3.4 MB',
      fileType: 'application/pdf',
    });
    setShowAttachmentMenu(false);
  };

  return (
    <div className="relative border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3 sm:p-4">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.zip,.txt"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*"
      />

      {/* Replying Preview Bar */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border-l-4 border-sky-500 text-xs animate-in slide-in-from-bottom-1">
          <div className="flex flex-col min-w-0 pr-2">
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              Replying to {replyingTo.senderName}
            </span>
            <span className="text-slate-600 dark:text-slate-300 truncate">
              {replyingTo.content}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editing Preview Bar */}
      {editingMessage && (
        <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 text-xs animate-in slide-in-from-bottom-1">
          <div className="flex flex-col min-w-0 pr-2">
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Editing message
            </span>
            <span className="text-slate-600 dark:text-slate-300 truncate">
              {editingMessage.content}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Cancel edit"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Voice Recording Active Bar */}
      {isRecordingVoice ? (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              Recording Voice Note...
            </span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
              {voiceSeconds}s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelVoiceRecording}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinishVoiceRecording}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
            >
              <StopCircle className="w-4 h-4" />
              Send Audio
            </button>
          </div>
        </div>
      ) : (
        /* Standard Composer Input Box */
        <div className="flex items-end gap-1.5 sm:gap-2">
          {/* Attachment Menu Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAttachmentMenu((prev) => !prev);
                setShowEmojiPicker(false);
              }}
              title="Attach files"
              className="p-2 sm:p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Attachment Dropdown Menu */}
            {showAttachmentMenu && (
              <div className="absolute bottom-full mb-2 left-0 w-52 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  Upload Document
                </button>

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  Upload Photo
                </button>

                <div className="border-t border-slate-100 dark:border-slate-700/60 my-1" />

                <button
                  type="button"
                  onClick={sendPresetDocument}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Sample PDF Spec
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendPresetImage(
                      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80'
                    )
                  }
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Sample UI Mockup
                </button>
              </div>
            )}
          </div>

          {/* Image Direct Upload Button */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            title="Send photo"
            className="hidden sm:inline-flex p-2 sm:p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Textarea Input Container */}
          <div className="relative flex-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 focus-within:border-sky-500 dark:focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                editingMessage
                  ? 'Edit message and press Enter...'
                  : isGroup
                  ? 'Message group...'
                  : 'Type a message...'
              }
              className="w-full max-h-32 px-3.5 py-2.5 bg-transparent border-none text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden resize-none leading-relaxed"
            />
          </div>

          {/* Emoji Picker Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker((prev) => !prev);
                setShowAttachmentMenu(false);
              }}
              title="Add emoji"
              className="p-2 sm:p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
            >
              <Smile className="w-5 h-5" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 right-0 z-40">
                <EmojiPickerPopover
                  onSelectEmoji={handleSelectEmoji}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Voice Record OR Send Action Button */}
          {text.trim() || editingMessage ? (
            <button
              type="button"
              onClick={handleSend}
              title={editingMessage ? 'Save changes' : 'Send message (Enter)'}
              className="p-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              title="Record voice message"
              className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/60 text-slate-600 dark:text-slate-300 hover:text-sky-500 transition-colors"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
