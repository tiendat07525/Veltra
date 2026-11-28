'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Phone, PhoneMissed, PhoneOff, RotateCcw, SmilePlus, Video } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Message, ReactionEmoji } from '@/types/message';
import { formatTime } from '@/lib/utils';
import { isEmojiOnly } from '@/lib/emoji';
import { MessageAttachments } from './MessageAttachments';
import { InlineError } from '@/components/ui/InlineError';
import { useLongPress } from '@/hooks/use-long-press';
import { MessageActionOverlay } from './MessageActionOverlay';
import { ReactionPicker } from './ReactionPicker';
import { groupReactions, myReaction } from '@/lib/reactions';
import { describeCallRecord } from '@/lib/call-format';
import type { CallMedia } from '@/types/call';

interface MessageBubbleProps {
  msg: Message;
  conversation: Conversation;
  currentUserId: string;
  // Rejects with an Error whose message is shown under the bubble
  onRevokeMessage?: (id: string) => Promise<void>;
  // Set (emoji) / remove (null) my reaction; rejects with an Error shown under the bubble
  onReactMessage?: (id: string, emoji: ReactionEmoji | null) => Promise<void>;
  onRetryMessage?: (clientMsgId: string) => void;
  onOpenImage: (url: string, name: string) => void;
  // Call records in a direct conversation: "Gọi lại"
  onCallAgain?: (media: CallMedia) => void;
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
  onReactMessage,
  onRetryMessage,
  onOpenImage,
  onCallAgain,
}) => {
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [reactError, setReactError] = useState<string | null>(null);
  // A reaction change is on the way: not optimistic, the buttons wait for the server
  const [reacting, setReacting] = useState(false);
  // Desktop: the hover row of five emoji
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Bubble position while the touch long-press menu is open
  const [pressedRect, setPressedRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const msgSenderId = senderIdOf(msg);
  const isOwn = msgSenderId.toLowerCase() === String(currentUserId).toLowerCase();
  // Optimistic copy not stored yet: no real _id, so it cannot be revoked
  const isPending = msg.status === 'sending' || msg.status === 'failed';
  // Call records cannot be revoked (the server refuses too)
  const canRevoke = msg.type !== 'system' && msg.type !== 'call' && isOwn && !msg.isRevoked && !isPending && !!onRevokeMessage;
  const canReact = msg.type !== 'system' && !msg.isRevoked && !isPending && !!onReactMessage;
  const hasMenu = canRevoke || canReact;
  const reactionGroups = groupReactions(msg.reactions, currentUserId);
  const mine = myReaction(msg.reactions, currentUserId);
  const callRecord = msg.type === 'call' && msg.call && !msg.isRevoked ? msg.call : null;
  const callText = callRecord ? describeCallRecord(callRecord, isOwn) : null;

  // Touch only: long press opens the menu (reactions, "Thu hồi" on own messages); desktop keeps the hover buttons
  const longPress = useLongPress(
    () => {
      if (bubbleRef.current) setPressedRect(bubbleRef.current.getBoundingClientRect());
    },
    { enabled: hasMenu }
  );
  const closeMenu = useCallback(() => setPressedRect(null), []);

  // The hover row closes on a click outside it or Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const react = async (emoji: ReactionEmoji | null) => {
    if (!onReactMessage || reacting) return;
    setPickerOpen(false);
    setReactError(null);
    setReacting(true);
    try {
      await onReactMessage(msg._id || (msg.id as string), emoji);
    } catch (err: unknown) {
      setReactError(err instanceof Error && err.message ? err.message : 'Không thể thả cảm xúc');
    } finally {
      setReacting(false);
    }
  };
  // Picking my current emoji again removes it
  const pick = (emoji: ReactionEmoji) => void react(emoji === mine ? null : emoji);

  const nameOf = (userId: string) => {
    if (String(userId) === String(currentUserId)) return 'Bạn';
    const p = conversation.participants.find((x) => String(x._id) === String(userId));
    return p?.displayName || p?.username || 'Người dùng';
  };

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
        hasMenu ? 'pointer-coarse:select-none [-webkit-touch-callout:none]' : ''
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
      {callRecord && callText ? (
        <div className="min-w-44">
          <div className="flex items-center gap-3">
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isOwn ? 'bg-white/20' : callText.missed ? 'bg-danger-soft text-danger' : 'bg-surface text-accent'
              }`}
              aria-hidden="true"
            >
              {callRecord.status === 'missed' ? (
                <PhoneMissed className="w-4 h-4" />
              ) : callRecord.status === 'declined' ? (
                <PhoneOff className="w-4 h-4" />
              ) : callRecord.media === 'video' ? (
                <Video className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-[13px] font-semibold ${!isOwn && callText.missed ? 'text-danger' : ''}`}>{callText.title}</p>
              <p className="text-[11px] opacity-80">{callText.detail}</p>
            </div>
          </div>
          {onCallAgain && !inMenu && (
            <button
              type="button"
              onClick={() => onCallAgain(callRecord.media)}
              className={`mt-2 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                isOwn ? 'bg-white/15 hover:bg-white/25' : 'bg-surface hover:bg-surface-2 text-accent'
              }`}
            >
              Gọi lại
            </button>
          )}
        </div>
      ) : msg.content && (
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
        {/* Hover buttons (mouse), beside the bubble on the inner side; touch screens use the long-press menu */}
        {hasMenu && (
          <div
            className={`relative flex items-center gap-0.5 transition-opacity pointer-coarse:hidden ${
              isOwn ? 'order-first mr-2' : 'order-last ml-2'
            } ${pickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
          >
            {canReact && (
              <div ref={pickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  disabled={reacting}
                  aria-expanded={pickerOpen}
                  className="p-1.5 text-fg-muted hover:text-fg hover:bg-surface-2 rounded-full transition-colors disabled:opacity-50"
                  title="Thả cảm xúc"
                  aria-label="Thả cảm xúc"
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>
                {pickerOpen && (
                  <ReactionPicker
                    selected={mine}
                    disabled={reacting}
                    onPick={pick}
                    className={`absolute bottom-full mb-1 z-20 p-1 rounded-full border border-line bg-surface shadow-lg ${
                      isOwn ? 'right-0' : 'left-0'
                    }`}
                  />
                )}
              </div>
            )}
            {canRevoke && (
              <button
                type="button"
                onClick={handleRevoke}
                className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger-soft rounded-full transition-colors"
                title="Thu hồi tin nhắn"
                aria-label="Thu hồi tin nhắn"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {renderBubble(false)}
      </div>
      {reactionGroups.length > 0 && !msg.isRevoked && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {reactionGroups.map((g) => {
            const names = g.userIds.map(nameOf).join(', ');
            const label = `${g.emoji} ${g.count}`;
            const chip = 'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-xs leading-none select-none';
            // Only my own chip is a button: it removes my reaction
            return g.mine && canReact ? (
              <button
                key={g.emoji}
                type="button"
                disabled={reacting}
                onClick={() => void react(null)}
                aria-pressed="true"
                title={`${names} · bấm để bỏ`}
                aria-label={`${label}: ${names}. Bấm để bỏ cảm xúc của bạn`}
                className={`${chip} border-accent bg-accent-soft text-fg hover:brightness-95 disabled:opacity-50`}
              >
                <span aria-hidden="true">{g.emoji}</span>
                <span className="font-semibold">{g.count}</span>
              </button>
            ) : (
              <span
                key={g.emoji}
                title={names}
                aria-label={`${label}: ${names}`}
                className={`${chip} border-line bg-surface text-fg-muted`}
              >
                <span aria-hidden="true">{g.emoji}</span>
                <span>{g.count}</span>
              </span>
            );
          })}
        </div>
      )}
      {reactError && (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <InlineError
            message={reactError}
            onDismiss={() => setReactError(null)}
            className="mt-1 max-w-[75%] sm:max-w-[70%] md:max-w-[65%]"
          />
        </div>
      )}
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
            <>
              {canReact && (
                <ReactionPicker
                  selected={mine}
                  disabled={reacting}
                  onPick={(emoji) => {
                    closeMenu();
                    pick(emoji);
                  }}
                  className={`p-1.5 justify-between ${canRevoke ? 'border-b border-line' : ''}`}
                />
              )}
              {canRevoke && (
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
              )}
            </>
          }
        />
      )}
    </div>
  );
};
