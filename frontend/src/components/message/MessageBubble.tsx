import React, { useState } from 'react';
import {
  FileText,
  Download,
  Check,
  CheckCheck,
  Pin,
  Phone,
  PhoneMissed,
  Info,
  CornerDownRight,
} from 'lucide-react';
import { Message, ReactionEmoji } from '@/types/message';
import { User } from '@/types/user';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MessageActions } from './MessageActions';
import { VoiceNotePlayer } from './VoiceNotePlayer';

interface MessageBubbleProps {
  message: Message;
  sender?: User;
  isCurrentUser: boolean;
  isGroup: boolean;
  showAvatar?: boolean;
  currentUserId: string;
  onReact: (emoji: ReactionEmoji) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward: () => void;
  onTogglePin: () => void;
  onOpenImage: (url: string, caption?: string) => void;
  onMarkUnread?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  sender,
  isCurrentUser,
  isGroup,
  showAvatar = true,
  currentUserId,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onForward,
  onTogglePin,
  onOpenImage,
  onMarkUnread,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // System Message
  if (message.type === 'system') {
    return (
      <div className="flex items-center justify-center my-3 px-4">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-xs text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
          <Info className="w-3.5 h-3.5 text-sky-500" />
          <span>{message.content}</span>
          <span className="text-[10px] opacity-75 ml-1">{message.createdAt}</span>
        </div>
      </div>
    );
  }

  // Call Message
  if (message.type === 'call') {
    const isMissed = message.callStatus === 'missed';
    return (
      <div className={`flex flex-col my-2 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 max-w-sm">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isMissed
                ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-500'
                : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-500'
            }`}
          >
            {isMissed ? <PhoneMissed className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {isMissed ? 'Cuộc gọi thoại nhỡ' : 'Cuộc gọi thoại kết thúc'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isMissed ? 'Không trả lời' : `${Math.floor((message.duration || 0) / 60)} phút ${((message.duration || 0) % 60)} giây`} • {message.createdAt}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const senderName = sender ? (sender.displayName || sender.username || 'Người dùng') : (isCurrentUser ? 'Bạn' : 'Thành viên');

  return (
    <div
      id={`msg-${message.id || message._id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative flex items-end gap-2 my-1 px-3 sm:px-4 transition-all ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar for others in group or direct */}
      {!isCurrentUser && showAvatar && (
        <div className="shrink-0 mb-1">
          <UserAvatar
            src={sender?.avatarUrl || sender?.avatar}
            name={senderName}
            size="sm"
            status={sender?.status}
            showStatus={!isGroup}
          />
        </div>
      )}
      {!isCurrentUser && !showAvatar && <div className="w-9 shrink-0" />}

      {/* Main Bubble Container */}
      <div
        className={`flex flex-col max-w-[85%] sm:max-w-[70%] md:max-w-[62%] ${
          isCurrentUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Sender Name in Group Chat */}
        {isGroup && !isCurrentUser && showAvatar && (
          <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mb-1 ml-2">
            {senderName}
          </span>
        )}

        {/* Pinned Indicator Banner on top of bubble */}
        {message.isPinned && (
          <div className="flex items-center gap-1 text-[10px] text-amber-500 font-medium mb-1 px-2">
            <Pin className="w-3 h-3 fill-amber-500" />
            <span>Đã ghim</span>
          </div>
        )}

        {/* Bubble Box */}
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 shadow-xs text-sm break-words transition-all duration-150 ${
            isCurrentUser
              ? 'bg-sky-600 dark:bg-sky-600 text-white rounded-br-xs'
              : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/60 rounded-bl-xs'
          } ${message.isDeleted ? 'italic text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-800/40 border-dashed' : ''}`}
        >
          {/* Reply Quote Banner */}
          {message.replyTo && !message.isDeleted && (
            <div
              className={`mb-2 px-2.5 py-1.5 rounded-lg text-xs border-l-2 flex flex-col gap-0.5 ${
                isCurrentUser
                  ? 'bg-sky-700/60 border-white/60 text-sky-100'
                  : 'bg-slate-200/70 dark:bg-slate-700/60 border-sky-500 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="font-semibold text-[11px] flex items-center gap-1">
                <CornerDownRight className="w-3 h-3" />
                {message.replyTo.senderName}
              </span>
              <p className="line-clamp-1 opacity-90">{message.replyTo.content}</p>
            </div>
          )}

          {/* Deleted State */}
          {message.isDeleted ? (
            <div className="flex items-center gap-1.5 py-0.5 text-xs text-slate-400 dark:text-slate-500">
              <Info className="w-3.5 h-3.5" />
              <span>Tin nhắn này đã bị xóa.</span>
            </div>
          ) : (
            <>
              {/* Image Message */}
              {message.type === 'image' && (
                <div className="space-y-1.5">
                  <div
                    onClick={() => onOpenImage(message.mediaUrl || message.content || '', 'Photo')}
                    className="relative rounded-xl overflow-hidden cursor-pointer group/img max-w-sm"
                  >
                    <img
                      src={message.mediaUrl || message.content}
                      alt="Phương tiện được chia sẻ"
                      className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200 group-hover/img:scale-102"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                      Nhấp để phóng to
                    </div>
                  </div>
                </div>
              )}

              {/* File Message */}
              {message.type === 'file' && (
                <div className="flex items-center gap-3 p-1.5 min-w-[200px]">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isCurrentUser
                        ? 'bg-white/20 text-white'
                        : 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-medium text-xs truncate">{message.fileName || message.content}</p>
                    <span className="text-[11px] opacity-75">{message.fileSize || '2.4 MB'}</span>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert(`Downloading file: ${message.fileName || 'attachment'}`);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      isCurrentUser
                        ? 'hover:bg-white/20 text-white'
                        : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                    title="Tải tệp"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              )}

              {/* Voice Message */}
              {message.type === 'audio' && (
                <VoiceNotePlayer duration={message.duration || 30} isCurrentUser={isCurrentUser} />
              )}

              {/* Text Message */}
              {message.type === 'text' && (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )}
            </>
          )}

          {/* Message Meta: Time + Edited + Read Receipts */}
          <div
            className={`flex items-center gap-1.5 mt-1 text-[10px] select-none ${
              isCurrentUser ? 'justify-end text-sky-100/80' : 'justify-start text-slate-400'
            }`}
          >
            {message.isEdited && !message.isDeleted && <span>(đã sửa)</span>}
            <span>{message.createdAt}</span>

            {isCurrentUser && !message.isDeleted && (
              <span className="inline-flex items-center ml-0.5" title={message.status}>
                {message.status === 'read' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-200 stroke-[2.5]" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-200/60" />
                ) : (
                  <Check className="w-3 h-3 text-sky-200/60" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reactions Pill Display below bubble */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1 -mb-1 px-1 z-10">
            {message.reactions.map((react, idx) => {
              const hasReacted = Boolean(react.users?.includes(currentUserId) || react.userId === currentUserId);
              const count = react.count ?? (react.users ? react.users.length : 1);
              return (
                <button
                  key={`${react.emoji}-${idx}`}
                  type="button"
                  onClick={() => onReact(react.emoji as any)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shadow-xs transition-transform active:scale-95 ${
                    hasReacted
                      ? 'bg-sky-50 dark:bg-sky-950/70 border-sky-400/50 text-sky-600 dark:text-sky-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                  title={`${count} reaction${count > 1 ? 's' : ''}`}
                >
                  <span className="text-sm">{react.emoji}</span>
                  <span className="text-[11px] font-semibold">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Toolbar on Hover */}
      {!message.isDeleted && isHovered && (
        <div
          className={`absolute top-0 z-20 transition-all ${
            isCurrentUser ? 'right-full mr-2' : 'left-full ml-2'
          }`}
        >
          <MessageActions
            isCurrentUser={isCurrentUser}
            isPinned={message.isPinned}
            onReact={onReact}
            onReply={onReply}
            onCopy={onCopy}
            onEdit={onEdit}
            onDelete={onDelete}
            onForward={onForward}
            onTogglePin={onTogglePin}
            onMarkUnread={onMarkUnread}
          />
        </div>
      )}
    </div>
  );
};
