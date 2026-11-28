'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Message } from '@/types/message';
import { formatTime } from '@/lib/utils';
import { isEmojiOnly } from '@/lib/emoji';
import { MessageAttachments } from './MessageAttachments';
import { InlineError } from '@/components/ui/InlineError';
import { useLongPress } from '@/hooks/use-long-press';
import { MessageActionOverlay } from './MessageActionOverlay';

interface MessageBubbleProps {
  msg: Message;
  conversation: Conversation;
  currentUserId: string;
  // Rejects with an Error whose message is shown under the bubble
  onRevokeMessage?: (id: string) => Promise<void>;
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
  const [revokeError, setRevokeError] = useState<string | null>(null);
  // Bubble position while the touch long-press menu is open
  const [pressedRect, setPressedRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const msgSenderId = senderIdOf(msg);
  const isOwn = msgSenderId.toLowerCase() === String(currentUserId).toLowerCase();
  // Optimistic copy not stored yet: no real _id, so it cannot be revoked
  const isPending = msg.status === 'sending' || msg.status === 'failed';
  const canRevoke = msg.type !== 'system' && isOwn && !msg.isRevoked && !isPending && !!onRevokeMessage;

  // Touch only: long press opens the menu with "Thu hồi"; desktop keeps the hover button
  const longPress = useLongPress(
    () => {
      if (bubbleRef.current) setPressedRect(bubbleRef.current.getBoundingClientRect());
    },
    { enabled: canRevoke }
  );
  const closeMenu = useCallback(() => setPressedRect(null), []);

  const handleRevoke = async () => {
    if (!onRevokeMessage) return;
    setRevokeError(null);
    try {
      await onRevokeMessage(msg._id || (msg.id as string));
    } catch (err: unknown) {
      setRevokeError(err instanceof Error && err.message ? err.message : 'Không thể thu hồi tin nhắn');
    }
  };

  // Group change note (left / removed / owner / added / renamed): text built by the server
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <p className="max-w-[85%] px-3 py-1 rounded-full bg-surface-2 text-[11px] text-fg-muted text-center">
          {msg.content}
          <span className="ml-1.5">{formatTime(msg.createdAt)}</span>
        </p>
      </div>
    );
  }

  // The bubble itself; drawn a second time (enlarged, not interactive) in the long-press menu
  const renderBubble = (inMenu: boolean) => (
    <div
      ref={inMenu ? undefined : bubbleRef}
      {...(inMenu ? {} : longPress)}
      className={`${inMenu ? 'w-full' : 'max-w-[75%] sm:max-w-[70%] md:max-w-[65%]'} px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-xs ${
        canRevoke ? 'pointer-coarse:select-none [-webkit-touch-callout:none]' : ''
      } ${!inMenu && pressedRect ? 'invisible' : ''} ${msg.isRevoked
        ? `bg-transparent border border-line text-fg-muted italic ${isOwn ? 'rounded-br-xs' : 'rounded-bl-xs'}`
        : isOwn
          ? 'bg-bubble-own text-on-primary rounded-br-xs'
          : 'bg-bubble-other text-fg rounded-bl-xs'
        } ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'failed' ? 'ring-2 ring-danger/70' : ''}`}
    >
      {/* Show sender name in groups */}
      {!isOwn && conversation.type === 'group' && !msg.isRevoked && (
        <p className="text-[11px] font-semibold text-accent mb-0.5">
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
      {msg.content && (
        <p
          className={`whitespace-pre-wrap break-words ${
            !msg.isRevoked && !msg.attachments?.length && isEmojiOnly(msg.content)
              ? 'text-3xl leading-tight'
              : 'text-[13px]'
          }`}
        >
          {msg.content}
        </p>
      )}
      {msg.status === 'sending' ? (
        <p className="text-[10px] mt-1 text-right select-none text-white/80">Đang gửi…</p>
      ) : msg.status === 'failed' ? (
        <p className="text-[10px] mt-1 flex items-center justify-end gap-1 select-none text-white/90">
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
          className={`text-[10px] mt-1 text-right select-none ${
            msg.isRevoked ? 'text-fg-muted' : isOwn ? 'text-white/80' : 'text-fg-muted'
          }`}
        >
          {formatTime(msg.createdAt)}
        </p>
      )}
    </div>
  );

  return (
    <div className="mb-2.5">
      <div className={`flex group ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {/* Hover revoke button (mouse); touch screens use the long-press menu instead */}
        {canRevoke && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity mr-2 pointer-coarse:hidden">
            <button
              type="button"
              onClick={handleRevoke}
              className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger-soft rounded-full transition-colors"
              title="Thu hồi tin nhắn"
              aria-label="Thu hồi tin nhắn"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {renderBubble(false)}
      </div>
      {revokeError && (
        <div className="flex justify-end">
          <InlineError
            message={revokeError}
            onDismiss={() => setRevokeError(null)}
            className="mt-1 max-w-[75%] sm:max-w-[70%] md:max-w-[65%]"
          />
        </div>
      )}

      {pressedRect && (
        <MessageActionOverlay
          anchor={pressedRect}
          alignRight={isOwn}
          bubble={renderBubble(true)}
          onClose={closeMenu}
          actions={
            <button
              type="button"
              onClick={() => {
                closeMenu();
                void handleRevoke();
              }}
              className="w-full min-h-11 px-4 flex items-center gap-3 text-sm font-medium text-danger hover:bg-danger-soft active:bg-danger-soft transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Thu hồi
            </button>
          }
        />
      )}
    </div>
  );
};
