'use client';

import React, { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { ConversationParticipant } from '@/types/conversation';
import { UserBasicInfo } from '@/types/user';
import { friendService } from '@/services/api/friend.service';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { nameOf } from './GroupMemberList';

// Same cap as the backend (MAX_GROUP_MEMBERS), only used to guide the picker
const MAX_GROUP_MEMBERS = 100;

interface AddGroupMembersProps {
  members: ConversationParticipant[];
  busy: boolean;
  // Resolves when the request finished (it reports its own success / error and never throws)
  onAdd: (userIds: string[]) => Promise<void>;
}

// Owner only: "Thêm thành viên" button, then a picker of friends not in the group yet
export const AddGroupMembers: React.FC<AddGroupMembersProps> = ({ members, busy, onAdd }) => {
  const [adding, setAdding] = useState(false);
  // Loaded the first time the picker opens, kept while the panel is open
  const [friends, setFriends] = useState<UserBasicInfo[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const memberIds = new Set(members.map((m) => m._id));
  const addableFriends = (friends ?? []).filter((f) => !memberIds.has(f._id));
  const slotsLeft = MAX_GROUP_MEMBERS - members.length;

  const openAdd = () => {
    setAdding(true);
    setSelectedIds([]);
    if (friends === null) {
      friendService
        .getFriends()
        .then(setFriends)
        .catch(() => setFriends([]));
    }
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < slotsLeft ? [...prev, id] : prev
    );

  const submitAdd = () => {
    if (selectedIds.length === 0) return;
    void onAdd(selectedIds).then(() => {
      setAdding(false);
      setSelectedIds([]);
    });
  };

  return (
    <section>
      {!adding ? (
        <button
          type="button"
          onClick={openAdd}
          disabled={slotsLeft <= 0}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold hover:bg-sky-500/20 disabled:opacity-40"
        >
          <UserPlus className="w-4 h-4" />
          {slotsLeft > 0 ? 'Thêm thành viên' : `Nhóm đã đủ ${MAX_GROUP_MEMBERS} thành viên`}
        </button>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Chọn bạn bè</p>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              Hủy
            </button>
          </div>
          {friends === null ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
            </div>
          ) : addableFriends.length === 0 ? (
            <p className="text-[11px] text-slate-500 py-2 text-center">Không còn bạn bè nào ngoài nhóm.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {addableFriends.map((friend) => {
                const checked = selectedIds.includes(friend._id);
                return (
                  <li key={friend._id}>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(friend._id)}
                        className="accent-sky-500"
                      />
                      <UserAvatar src={friend.avatarUrl} name={nameOf(friend)} size="sm" />
                      <span className="text-xs text-slate-800 dark:text-slate-200 truncate">{nameOf(friend)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={submitAdd}
            disabled={busy || selectedIds.length === 0}
            className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-semibold"
          >
            Thêm {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </button>
        </div>
      )}
    </section>
  );
};
