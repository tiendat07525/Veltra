'use client';

import React from 'react';
import { ArrowLeft, Bell, BellOff, Info, Phone } from 'lucide-react';
import type { CallMedia } from '@/types/call';
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
  // Direct conversations: start a call; disabled while a call of mine is on screen
  onStartCall?: (media: CallMedia) => void;
  callDisabled?: boolean;
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
  onStartCall,
  callDisabled = false,
}) => {
  const otherOnlineCount = conversation.participants.filter(
    (p) => p._id !== currentUserId && onlineIds?.has(p._id)
  ).length;
  const partnerOnline = !!partner && !!onlineIds?.has(partner._id);

  return (
    <header className="h-16 px-2 sm:px-4 flex items-center gap-2 sm:gap-3 border-b border-line bg-surface shrink-0">
      {/* Back button (mobile) */}
      <button
        type="button"
        onClick={onBackMobile}
        className="md:hidden p-2.5 rounded-xl text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
        aria-label="Quay lại danh sách"
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
        <h3 className="text-sm font-bold text-fg truncate">{conversationName}</h3>
        <p className="text-[11px] text-fg-muted truncate">
          {conversation.type === 'group'
            ? `${conversation.participants.length} thành viên${
                otherOnlineCount > 0 ? ` · ${otherOnlineCount} đang hoạt động` : ''
              }`
            : partnerOnline
              ? 'Đang hoạt động'
              : 'Ngoại tuyến'}
        </p>
      </div>

      {conversation.type === 'direct' && onStartCall && (
        <button
          type="button"
          onClick={() => onStartCall('audio')}
          disabled={callDisabled}
          className="p-2.5 rounded-xl text-fg-muted hover:text-accent hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:pointer-events-none"
          title="Gọi thoại"
          aria-label="Gọi thoại"
        >
          <Phone className="w-5 h-5" />
        </button>
      )}

      {onToggleMute && (
        <button
          type="button"
          onClick={onToggleMute}
          className={`p-2.5 rounded-xl transition-colors ${
            isMuted ? 'text-accent bg-accent-soft' : 'text-fg-muted hover:text-accent hover:bg-accent-soft'
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
          className="p-2.5 rounded-xl text-fg-muted hover:text-accent hover:bg-accent-soft transition-colors"
          title="Thông tin nhóm"
          aria-label="Thông tin nhóm"
        >
          <Info className="w-5 h-5" />
        </button>
      )}
    </header>
  );
};
