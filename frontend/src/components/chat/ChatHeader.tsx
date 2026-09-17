import React from 'react';
import {
  Phone,
  Video,
  Info,
  Search,
  ChevronLeft,
  X,
} from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { User } from '@/types/user';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { OnlineStatusDot } from '@/components/ui/OnlineStatusDot';

interface ChatHeaderProps {
  conversation: Conversation;
  partner?: User | null;
  onBackMobile?: () => void;
  onToggleInfo: () => void;
  onStartVoiceCall: () => void;
  onStartVideoCall: () => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  showSearchInput: boolean;
  onToggleSearchInput: () => void;
  isInfoOpen?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  partner,
  onBackMobile,
  onToggleInfo,
  onStartVoiceCall,
  onStartVideoCall,
  searchQuery,
  onSearchChange,
  showSearchInput,
  onToggleSearchInput,
  isInfoOpen = false,
}) => {
  const isGroup = conversation.type === 'group';

  return (
    <header className="h-16 px-3 sm:px-5 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
      {/* Left: Back (on mobile) + Avatar + Info */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onBackMobile && (
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Back to conversation list"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div className="relative cursor-pointer" onClick={onToggleInfo}>
          <UserAvatar
            src={conversation.avatar}
            name={conversation.name}
            size="md"
            status={partner?.status}
            showStatus={!isGroup}
          />
        </div>

        <div className="min-w-0 cursor-pointer" onClick={onToggleInfo}>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {conversation.name}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {isGroup ? (
              <span>{conversation.participants.length} members</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <OnlineStatusDot status={partner?.status || 'offline'} size="sm" />
                {partner?.status === 'online' ? (
                  <span className="text-emerald-500 font-medium">Active now</span>
                ) : partner?.status === 'away' ? (
                  <span className="text-amber-500 font-medium">{partner?.lastSeen || 'Away'}</span>
                ) : (
                  <span>{partner?.lastSeen ? `Active ${partner.lastSeen}` : 'Offline'}</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: In-Chat Search Input if activated */}
      {showSearchInput && (
        <div className="hidden sm:flex items-center flex-1 max-w-xs mx-4 relative animate-in fade-in slide-in-from-top-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search in chat..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1.5 focus:ring-sky-500 focus:outline-hidden"
            autoFocus
          />
          <button
            type="button"
            onClick={onToggleSearchInput}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 text-slate-500 dark:text-slate-400">
        <button
          type="button"
          onClick={onToggleSearchInput}
          title="Search conversation"
          className={`p-2 rounded-xl transition-colors ${
            showSearchInput
              ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Search className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          onClick={onStartVoiceCall}
          title="Start voice call"
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-500 transition-colors"
        >
          <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          onClick={onStartVideoCall}
          title="Start video call"
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-500 transition-colors"
        >
          <Video className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        <button
          type="button"
          onClick={onToggleInfo}
          title="Conversation information"
          className={`p-2 rounded-xl transition-colors ${
            isInfoOpen
              ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Info className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </header>
  );
};
