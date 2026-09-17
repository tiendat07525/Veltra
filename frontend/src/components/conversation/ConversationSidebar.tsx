import React, { useState } from 'react';
import {
  Search,
  Plus,
  Inbox,
  Star,
  Users,
  MessageCircle,
  X,
  Filter,
} from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { ConversationFilter } from '@/hooks/use-conversations';
import { ConversationItem } from './ConversationItem';
import { NewConversationModal } from './NewConversationModal';
import { User } from '@/types/user';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  participantsMap: Map<string, User>;
  onTogglePin: (id: string, e?: React.MouseEvent) => void;
  onToggleMute: (id: string, e?: React.MouseEvent) => void;
  onCreateNewConversation: (params: {
    type: 'direct' | 'group';
    name: string;
    participants: string[];
  }) => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  participantsMap,
  onTogglePin,
  onToggleMute,
  onCreateNewConversation,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);

  const filterTabs: { id: ConversationFilter; label: string; icon: any }[] = [
    { id: 'all', label: 'All', icon: Inbox },
    { id: 'direct', label: 'Direct', icon: MessageCircle },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'favorites', label: 'Pinned', icon: Star },
    { id: 'unread', label: 'Unread', icon: Filter },
  ];

  return (
    <aside className="w-full md:w-80 lg:w-92 h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 shrink-0 select-none">
      {/* Top Header with Title and New Chat Button */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white tracking-tight">
            Messages
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500">
            {conversations.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm shadow-sky-600/30 transition-all hover:scale-102 active:scale-98"
          title="New conversation"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Chat</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search conversations, messages..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-100/90 dark:bg-slate-800/80 border border-transparent focus:border-sky-500/50 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
        {conversations.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center p-4 text-center text-slate-400 text-xs">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              No conversations found
            </p>
            <p className="text-slate-400 text-[11px]">
              {searchQuery
                ? `No chats match "${searchQuery}"`
                : 'Try choosing another filter tab or create a new conversation.'}
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            // Find partner status if direct
            let partnerStatus = undefined;
            if (conv.type === 'direct') {
              const partnerId = conv.participants.find((id) => id !== 'user-me');
              if (partnerId) {
                partnerStatus = participantsMap.get(partnerId)?.status;
              }
            }

            return (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversationId === conv.id}
                status={partnerStatus}
                onSelect={() => onSelectConversation(conv.id)}
                onTogglePin={(e) => onTogglePin(conv.id, e)}
                onToggleMute={(e) => onToggleMute(conv.id, e)}
              />
            );
          })
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreateConversation={onCreateNewConversation}
      />
    </aside>
  );
};
