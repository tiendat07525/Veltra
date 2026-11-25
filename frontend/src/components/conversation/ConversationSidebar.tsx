'use client';

import React, { useState } from 'react';
import {
  Search,
  Plus,
  Inbox,
  Users,
  MessageCircle,
  X,
  Filter,
} from 'lucide-react';
import { Conversation, ConversationFilter } from '@/types/conversation';
import { ConversationItem } from './ConversationItem';
import { NewConversationModal } from './NewConversationModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  currentUserId: string;
  onCreateNewConversation: (params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
  }) => Promise<void>;
  // Called after the user confirms; rejects with an Error shown in the confirmation dialog
  onDeleteConversation: (id: string) => Promise<void>;
  // Presence / typing from usePresence
  onlineIds?: Set<string>;
  typingByConversation?: Record<string, string[]>;
  // From settings (useSettings)
  mutedConversationIds?: Set<string>;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  currentUserId,
  onCreateNewConversation,
  onDeleteConversation,
  onlineIds,
  typingByConversation,
  mutedConversationIds,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  // Conversation waiting for the delete confirmation (trash button or long press on touch)
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);

  const deleteDescription = (conv: Conversation) => {
    if (conv.type === 'group') {
      return `Nhóm "${conv.group?.name || 'Nhóm'}" cùng toàn bộ tin nhắn sẽ bị xóa với mọi thành viên. Không thể hoàn tác.`;
    }
    const other = conv.participants.find((p) => p._id !== currentUserId);
    const name = other?.displayName || other?.username || 'người này';
    return `Toàn bộ tin nhắn với ${name} sẽ bị xóa ở cả hai phía. Không thể hoàn tác.`;
  };

  const filterTabs: { id: ConversationFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all', label: 'Tất cả', icon: Inbox },
    { id: 'direct', label: 'Cá nhân', icon: MessageCircle },
    { id: 'groups', label: 'Nhóm', icon: Users },
    { id: 'unread', label: 'Chưa đọc', icon: Filter },
  ];

  return (
    <aside className="w-full md:w-80 lg:w-92 h-full flex flex-col bg-surface md:border-r border-line shrink-0 select-none">
      {/* Top Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-fg tracking-tight">
            Tin nhắn
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-surface-2 text-xs font-semibold text-fg-muted">
            {conversations.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold transition-colors"
          title="Tin nhắn mới"
          aria-label="Tin nhắn mới"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Nhắn tin</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            placeholder="Tìm kiếm cuộc trò chuyện..."
            aria-label="Tìm kiếm cuộc trò chuyện"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-surface-2 border border-transparent focus:border-primary/50 rounded-xl text-xs text-fg placeholder:text-fg-muted focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-fg-muted hover:text-fg"
              aria-label="Xóa nội dung tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1 pb-1" role="tablist" aria-label="Lọc cuộc trò chuyện">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange(tab.id)}
                role="tab"
                aria-selected={isActive}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-8 px-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2'
                }`}
              >
                {/* No icons at 768–1023px, where the list is only 320px wide */}
                <Icon className="w-3.5 h-3.5 shrink-0 md:max-lg:hidden" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
        {conversations.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center p-4 text-center text-fg-muted text-xs">
            <p className="font-semibold text-fg mb-1">
              Không tìm thấy cuộc trò chuyện nào
            </p>
            <p className="text-[11px]">
              {searchQuery
                ? `Không có kết quả cho "${searchQuery}"`
                : 'Tạo cuộc trò chuyện mới để bắt đầu nhắn tin.'}
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv._id}
              conversation={conv}
              isActive={activeConversationId === conv._id}
              currentUserId={currentUserId}
              onSelect={() => onSelectConversation(conv._id)}
              onDelete={() => setConfirmDelete(conv)}
              // Direct: the partner is online. Group: at least one other member is.
              isOnline={
                !!onlineIds &&
                conv.participants.some((p) => p._id !== currentUserId && onlineIds.has(p._id))
              }
              typingUserIds={typingByConversation?.[conv._id]}
              isMuted={!!mutedConversationIds?.has(conv._id)}
            />
          ))
        )}
      </div>

      {/* Delete confirmation; a failure is shown inside it */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Xóa cuộc trò chuyện?"
        description={confirmDelete ? deleteDescription(confirmDelete) : ''}
        confirmLabel="Xóa"
        onConfirm={() => (confirmDelete ? onDeleteConversation(confirmDelete._id) : Promise.resolve())}
        onClose={() => setConfirmDelete(null)}
      />

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={showNewModal}
        currentUserId={currentUserId}
        onClose={() => setShowNewModal(false)}
        onCreateConversation={onCreateNewConversation}
      />
    </aside>
  );
};
