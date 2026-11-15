'use client';

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Message } from '@/types/message';
import { formatTime } from '@/lib/utils';
import { MessageAttachments } from './MessageAttachments';

interface MessageBubbleProps {
  msg: Message;
  conversation: Conversation;
  currentUserId: string;
  onRevokeMessage?: (id: string) => void;
  onRetryMessage?: (clientMsgId: string) => void;
  onOpenImage: (url: string, name: string) => void;
}

// senderId as a string, also when the server sent a populated / serialized object
const senderIdOf = (msg: Message) => {
  let msgSenderId = String(msg.senderId);
  if (typeof msg.senderId === 'object' && msg.senderId !== null) {
    const senderObj = msg.senderId as Record<string, unknown>;
    msgSenderId = String(senderObj._id || senderObj.id || senderObj.$oid || msg.senderId);

    // Fallback if serialization resulted in an empty object
    if (msgSenderId === '[object Object]') {
      msgSenderId = ''; // Prevent false positives
    }
  }
  return msgSenderId;
};

/**
 * One message: a system note (group change), or a bubble with sender name (groups),
 * attachments, text and its send state (sending / failed + retry / time). Text only, never HTML.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  conversation,
  currentUserId,
  onRevokeMessage,
  onRetryMessage,
  onOpenImage,
}) => {
  // Group change note (left / removed / owner / added / renamed): text built by the server
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <p className="max-w-[85%] px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-500 dark:text-slate-400 text-center">
          {msg.content}
          <span className="ml-1.5 text-slate-400">{formatTime(msg.createdAt)}</span>
        </p>
      </div>
    );
  }

  const msgSenderId = senderIdOf(msg);
  const isOwn = msgSenderId.toLowerCase() === String(currentUserId).toLowerCase();
  // Optimistic copy not stored yet: no real _id, so it cannot be revoked
  const isPending = msg.status === 'sending' || msg.status === 'failed';

  return (
    <div className={`flex mb-2.5 group ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {/* Revoke button (only for own, stored, not revoked messages) */}
      {isOwn && !msg.isRevoked && !isPending && (
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
          } ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'failed' ? 'ring-2 ring-rose-500/70' : ''}`}
      >
        {/* Show sender name in groups */}
        {!isOwn && conversation.type === 'group' && !msg.isRevoked && (
          <p className="text-[11px] font-semibold text-sky-500 dark:text-sky-400 mb-0.5">
            {(() => {
              const sender = conversation.participants.find((p) => String(p._id) === String(msgSenderId));
              return sender?.displayName || sender?.username || 'Người dùng';
            })()}
          </p>
        )}
        {!msg.isRevoked && msg.attachments?.length ? (
          <div className={msg.content ? 'mb-1.5' : ''}>
            <MessageAttachments attachments={msg.attachments} isOwn={isOwn} onOpenImage={onOpenImage} />
          </div>
        ) : null}
        {msg.content && <p className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</p>}
        {msg.status === 'sending' ? (
          <p className="text-[10px] mt-1 text-right select-none text-sky-200">Đang gửi…</p>
        ) : msg.status === 'failed' ? (
          <p className="text-[10px] mt-1 flex items-center justify-end gap-1 select-none text-rose-100">
            <AlertCircle className="w-3 h-3" />
            Gửi thất bại ·
            <button
              type="button"
              onClick={() => msg.clientMsgId && onRetryMessage?.(msg.clientMsgId)}
              className="font-semibold underline hover:text-white"
            >
              Gửi lại
            </button>
          </p>
        ) : (
          <p
            className={`text-[10px] mt-1 text-right select-none ${msg.isRevoked ? 'text-slate-400' : isOwn ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'
              }`}
          >
            {formatTime(msg.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
};
