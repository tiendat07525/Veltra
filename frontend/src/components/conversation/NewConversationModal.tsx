import React, { useState } from 'react';
import { X, Search, Users, UserCheck, MessageSquarePlus, Check } from 'lucide-react';
import { MOCK_USERS, CURRENT_USER } from '@/data/mock/users';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    type: 'direct' | 'group';
    name: string;
    participants: string[];
  }) => void;
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

  if (!isOpen) return null;

  const availableUsers = MOCK_USERS.filter((u) => u.id !== CURRENT_USER.id);
  const filteredUsers = availableUsers.filter((u) =>
    u.displayName.toLowerCase().includes(search.toLowerCase().trim()) ||
    u.username.toLowerCase().includes(search.toLowerCase().trim())
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

  const handleStart = () => {
    if (selectedUserIds.length === 0) return;

    if (tab === 'direct') {
      const selectedUser = MOCK_USERS.find((u) => u.id === selectedUserIds[0]);
      onCreateConversation({
        type: 'direct',
        name: selectedUser?.displayName || 'Direct Chat',
        participants: [CURRENT_USER.id, selectedUserIds[0]],
      });
    } else {
      if (!groupName.trim()) return;
      onCreateConversation({
        type: 'group',
        name: groupName.trim(),
        participants: [CURRENT_USER.id, ...selectedUserIds],
      });
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            New Conversation
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch: Direct vs Group */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl my-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setTab('direct');
              setSelectedUserIds([]);
            }}
            className={`py-2 rounded-lg transition-all ${
              tab === 'direct' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'text-slate-500'
            }`}
          >
            Direct Message
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('group');
              setSelectedUserIds([]);
            }}
            className={`py-2 rounded-lg transition-all ${
              tab === 'group' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'text-slate-500'
            }`}
          >
            Create Group
          </button>
        </div>

        {/* Group Name input if group */}
        {tab === 'group' && (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Group Name
            </label>
            <input
              type="text"
              placeholder="e.g. Design Systems, Project Delta..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1.5 focus:ring-sky-500 focus:outline-hidden"
            />
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search team members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1.5 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>

        {/* Users list */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {filteredUsers.map((user) => {
            const isSelected = selectedUserIds.includes(user.id);
            return (
              <div
                key={user.id}
                onClick={() => toggleUserSelection(user.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-sky-50 dark:bg-sky-950/40 border border-sky-500/30'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={user.avatar}
                    name={user.displayName}
                    size="sm"
                    status={user.status}
                    showStatus
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {user.displayName}
                    </p>
                    <p className="text-[11px] text-slate-400">@{user.username} • {user.role || 'Member'}</p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedUserIds.length === 0 || (tab === 'group' && !groupName.trim())}
            onClick={handleStart}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {tab === 'direct' ? 'Start Chat' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
};
