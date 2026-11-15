'use client';

import React from 'react';
import { ArrowLeft, Bell, BellOff, Info } from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ChatHeaderProps {
  conversation: Conversation;
  conversationName: string;
  partner: ConversationParticipant | null;
  currentUserId: string;
  onlineIds?: Set<string>;
  onBackMobile: () => void;
  // Groups only: opens the group info panel
  onOpenGroupInfo?: () => void;
  // Per-conversation mute (settings)
  isMuted?: boolean;
  onToggleMute?: () => void;
}

// Name, avatar and online state of the open conversation
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  conversationName,
  partner,
  currentUserId,
  onlineIds,
  onBackMobile,
  onOpenGroupInfo,
  isMuted = false,
  onToggleMute,
}) => {
  const otherOnlineCount = conversation.participants.filter(
    (p) => p._id !== currentUserId && onlineIds?.has(p._id)
  ).length;
  const partnerOnline = !!partner && !!onlineIds?.has(partner._id);

  return (
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
        status={partnerOnline ? 'online' : 'offline'}
        showStatus={conversation.type !== 'group' && partnerOnline}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{conversationName}</h3>
        <p className="text-[11px] text-slate-500">
          {conversation.type === 'group'
            ? `${conversation.participants.length} thành viên${
                otherOnlineCount > 0 ? ` · ${otherOnlineCount} đang hoạt động` : ''
              }`
            : partnerOnline
              ? 'Đang hoạt động'
              : 'Ngoại tuyến'}
        </p>
      </div>

      {onToggleMute && (
        <button
          type="button"
          onClick={onToggleMute}
          className={`p-2 rounded-xl transition-colors ${
            isMuted
              ? 'text-amber-500 hover:bg-amber-500/10'
              : 'text-slate-400 hover:text-sky-500 hover:bg-sky-500/10'
          }`}
          title={isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
          aria-label={isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
          aria-pressed={isMuted}
        >
          {isMuted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </button>
      )}

      {conversation.type === 'group' && onOpenGroupInfo && (
        <button
          type="button"
          onClick={onOpenGroupInfo}
          className="p-2 rounded-xl text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
          title="Thông tin nhóm"
          aria-label="Thông tin nhóm"
        >
          <Info className="w-5 h-5" />
        </button>
      )}
    </header>
  );
};
