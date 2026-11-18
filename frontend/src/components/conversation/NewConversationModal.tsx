'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, MessageSquarePlus, Check, Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { User, UserBasicInfo } from '@/types/user';
import { authService } from '@/services/api/auth.service';
import { userService } from '@/services/api/user.service';
import { friendService } from '@/services/api/friend.service';
import { InlineError } from '@/components/ui/InlineError';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
    // Rejects with an Error whose message is shown in the modal (which stays open)
  }) => Promise<void>;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  onClose,
  onCreateConversation,
}) => {
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  // Groups may only include friends (enforced by the backend)
  const [friends, setFriends] = useState<UserBasicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void Promise.resolve().then(() => {
        setLoading(true);
        setSelectedUserIds([]);
        setSearch('');
        setSubmitError(null);
        setGroupName('');
        setTab('direct');
      });
      async function load() {
        try {
          const [me, users, friendList] = await Promise.all([
            authService.getCurrentUser(),
            userService.getUsers(),
            friendService.getFriends().catch((err: unknown) => {
              console.error('Lỗi khi tải danh sách bạn bè:', err);
              return [] as UserBasicInfo[];
            }),
          ]);
          setAvailableUsers(users.filter((u) => u._id !== me._id));
          setFriends(friendList);
        } catch (err) {
          console.error('Lỗi khi tải danh sách người dùng:', err);
        } finally {
          setLoading(false);
        }
      }
      load();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const listedUsers: UserBasicInfo[] = tab === 'group' ? friends : availableUsers;
  const filteredUsers = listedUsers.filter(
    (u) =>
      (u.displayName || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase().trim())
  );

  const toggleUserSelection = (id: string) => {
    if (tab === 'direct') {
      setSelectedUserIds([id]);
    } else {
      setSelectedUserIds((prev) =>
        prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
      );
    }
  };

  const handleStart = async () => {
    if (selectedUserIds.length === 0 || submitting) return;
    if (tab === 'group' && !groupName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      if (tab === 'direct') {
        await onCreateConversation({
          type: 'direct',
          participants: [selectedUserIds[0]],
        });
      } else {
        await onCreateConversation({
          type: 'group',
          participants: selectedUserIds,
          groupName: groupName.trim(),
        });
      }
      onClose();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error && err.message ? err.message : 'Không thể tạo cuộc trò chuyện');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-surface border border-line p-4 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <h3 id="new-conversation-title" className="text-base font-bold text-fg">
            Tin nhắn mới
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-fg-muted hover:text-fg hover:bg-surface-2 rounded-xl"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 p-1 bg-surface-2 rounded-xl my-4 text-xs font-semibold" role="tablist">
          <button
            type="button"
            onClick={() => {
              setTab('direct');
              setSelectedUserIds([]);
            }}
            role="tab"
            aria-selected={tab === 'direct'}
            className={`min-h-9 rounded-lg transition-colors ${
              tab === 'direct' ? 'bg-surface text-accent shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Tin nhắn cá nhân
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('group');
              setSelectedUserIds([]);
            }}
            role="tab"
            aria-selected={tab === 'group'}
            className={`min-h-9 rounded-lg transition-colors ${
              tab === 'group' ? 'bg-surface text-accent shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Tạo nhóm
          </button>
        </div>

        {/* Group Name input */}
        {tab === 'group' && (
          <div className="mb-3">
            <label htmlFor="new-group-name" className="block text-xs font-semibold text-fg mb-1.5">
              Tên nhóm
            </label>
            <input
              type="text"
              placeholder="VD: Nhóm dự án, Lớp học..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              id="new-group-name"
              className="w-full min-h-10 px-3 py-2 bg-surface-2 rounded-xl text-xs text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-primary/30 focus:outline-hidden"
            />
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            placeholder={tab === 'group' ? 'Tìm kiếm bạn bè...' : 'Tìm kiếm người dùng...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm bạn bè"
            className="w-full min-h-10 pl-9 pr-3 py-2 bg-surface-2 rounded-xl text-xs text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-primary/30 focus:outline-hidden"
          />
        </div>

        {/* Users list */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-xs text-fg-muted">
              {tab === 'group' && friends.length === 0
                ? 'Bạn cần kết bạn trước khi tạo nhóm'
                : 'Không tìm thấy người dùng nào'}
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user._id);
              return (
                <button
                  type="button"
                  key={user._id}
                  onClick={() => toggleUserSelection(user._id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                    isSelected ? 'bg-accent-soft border-primary/30' : 'border-transparent hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={user.avatarUrl}
                      name={user.displayName || user.username || ''}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">
                        {user.displayName || user.username}
                      </p>
                      <p className="text-[11px] text-fg-muted truncate">@{user.username}</p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center border transition-colors ${
                      isSelected ? 'bg-primary border-primary text-on-primary' : 'border-fg-muted/50'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <InlineError message={submitError} onDismiss={() => setSubmitError(null)} className="mt-4" />

        {/* Action Button */}
        <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-4 text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-2 rounded-xl"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting || selectedUserIds.length === 0 || (tab === 'group' && !groupName.trim())}
            onClick={handleStart}
            className="flex items-center gap-2 min-h-10 px-4 text-xs font-semibold text-on-primary bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            {tab === 'direct' ? 'Bắt đầu trò chuyện' : 'Tạo nhóm'}
          </button>
        </div>
      </div>
    </div>
  );
};
