'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { Message } from '@/types/message';
import {
  MessageSquare,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatTime, formatDate } from '@/lib/utils';

interface ChatWindowProps {
  conversation: Conversation | null;
  conversationName: string;
  partner: ConversationParticipant | null;
  messages: Message[];
  loadingMessages: boolean;
  sendingMessage: boolean;
  onSendMessage: (content: string) => void;
  onBackMobile: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  currentUserId: string;
  messagesError: string | null;
  onRefreshMessages: () => void;
  onRevokeMessage?: (id: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  conversationName,
  partner,
  messages,
  loadingMessages,
  sendingMessage,
  onSendMessage,
  onBackMobile,
  onShowToast,
  currentUserId,
  messagesError,
  onRefreshMessages,
  onRevokeMessage,
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when conversation changes
  useEffect(() => {
    if (conversation) {
      inputRef.current?.focus();
    }
  }, [conversation?._id]);

  const handleSend = () => {
    if (!inputValue.trim() || sendingMessage) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Empty state
  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950">
        <header className="h-16 px-4 md:px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center shrink-0 md:hidden">
          <button
            type="button"
            onClick={onBackMobile}
            className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="ml-2 font-bold text-slate-800 dark:text-white">Tin nhắn</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <div className="w-16 h-16 rounded-3xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 stroke-[1.75]" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            Chưa chọn cuộc trò chuyện nào
          </h3>
          <p className="text-xs max-w-sm text-slate-500 leading-relaxed">
            Chọn một cuộc trò chuyện từ danh sách hoặc bắt đầu tin nhắn mới.
          </p>
        </div>
      </div>
    );
  }

  // Group messages by date for display
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  messages.forEach((msg) => {
    const msgDate = formatDate(msg.createdAt);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="h-16 px-4 flex items-center gap-3 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        {/* Back button (mobile) */}
        <button
          type="button"
          onClick={onBackMobile}
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <UserAvatar
          src={partner?.avatarUrl}
          name={conversationName}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {conversationName}
          </h3>
          <p className="text-[11px] text-slate-500">
            {conversation.type === 'group'
              ? `${conversation.participants.length} thành viên`
              : ''}
          </p>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
            <span className="ml-2 text-xs text-slate-400">Đang tải tin nhắn...</span>
          </div>
        ) : messagesError ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <p className="text-xs text-rose-400 mb-2">{messagesError}</p>
            <button
              onClick={onRefreshMessages}
              className="flex items-center gap-1 text-xs text-sky-400 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Thử lại
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageSquare className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-xs">Chưa có tin nhắn nào. Hãy gửi tin nhắn đầu tiên!</p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500">
                    {group.date}
                  </span>
                </div>

                {/* Messages */}
                {group.messages.map((msg) => {
                  let msgSenderId = String(msg.senderId);
                  if (typeof msg.senderId === 'object' && msg.senderId !== null) {
                    const senderObj = msg.senderId as any;
                    msgSenderId = String(senderObj._id || senderObj.id || senderObj.$oid || msg.senderId);

                    // Fallback if serialization resulted in an empty object
                    if (msgSenderId === '[object Object]') {
                      msgSenderId = ''; // Prevent false positives
                    }
                  }

                  const isOwn = msgSenderId.toLowerCase() === String(currentUserId).toLowerCase();

                  return (
                    <div
                      key={msg._id || msg.id}
                      className={`flex mb-2.5 group ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Revoke button (only for own messages and not revoked) */}
                      {isOwn && !msg.isRevoked && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                          <button
                            type="button"
                            onClick={() => onRevokeMessage?.(msg._id || msg.id as string)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-colors"
                            title="Thu hồi tin nhắn"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div
                        className={`max-w-[75%] sm:max-w-[70%] md:max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-xs ${msg.isRevoked
                          ? 'bg-transparent border border-slate-200 dark:border-slate-800 text-slate-400 italic rounded-br-xs'
                          : isOwn
                            ? 'bg-sky-600 hover:bg-sky-500 text-white rounded-br-xs'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-xs'
                          }`}
                      >
                        {/* Show sender name in groups */}
                        {!isOwn && conversation.type === 'group' && !msg.isRevoked && (
                          <p className="text-[11px] font-semibold text-sky-500 dark:text-sky-400 mb-0.5">
                            {conversation.participants.find((p) => String(p._id) === String(msgSenderId))
                              ?.displayName || 'Người dùng'}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</p>
                        <p
                          className={`text-[10px] mt-1 text-right select-none ${msg.isRevoked ? 'text-slate-400' : isOwn ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
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
            placeholder="Nhập tin nhắn..."
            disabled={sendingMessage}
            rows={1}
            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-sky-500/50 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 transition-all disabled:opacity-60 resize-none overflow-y-auto"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || sendingMessage}
            className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            title="Gửi tin nhắn"
          >
            {sendingMessage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
