'use client';

import React, { useMemo, useState } from 'react';
import { Check, Crown, Loader2, LogOut, Pencil, UserMinus, UserPlus, X } from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { UserBasicInfo } from '@/types/user';
import { friendService } from '@/services/api/friend.service';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Same cap as the backend (MAX_GROUP_MEMBERS), only used to guide the picker
const MAX_GROUP_MEMBERS = 100;

interface GroupInfoPanelProps {
  conversation: Conversation;
  currentUserId: string;
  // Online members (usePresence)
  onlineIds?: Set<string>;
  onClose: () => void;
  // Each handler reports its own success / error (toast) and never throws
  onRename: (groupName: string) => Promise<void>;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onTransferOwner: (userId: string) => Promise<void>;
  onLeave: () => Promise<void>;
}

type PendingAction =
  | { kind: 'remove' | 'transfer'; member: ConversationParticipant }
  | { kind: 'leave' };

const nameOf = (user: { displayName?: string; username?: string }) =>
  user.displayName || user.username || 'Người dùng';

export const GroupInfoPanel: React.FC<GroupInfoPanelProps> = ({
  conversation,
  currentUserId,
  onlineIds,
  onClose,
  onRename,
  onAddMembers,
  onRemoveMember,
  onTransferOwner,
  onLeave,
}) => {
  const ownerId = conversation.group?.createdBy;
  const isOwner = ownerId === currentUserId;
  const members = conversation.participants;
  const groupName = conversation.group?.name || '';

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(groupName);
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<UserBasicInfo[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Owner first, then by join order as the server returns them
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => Number(b._id === ownerId) - Number(a._id === ownerId)),
    [members, ownerId]
  );

  // An owner can leave only as the last member (which deletes the group)
  const ownerMustTransfer = isOwner && members.length > 1;
  const memberIds = new Set(members.map((m) => m._id));
  const addableFriends = (friends ?? []).filter((f) => !memberIds.has(f._id));
  const slotsLeft = MAX_GROUP_MEMBERS - members.length;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = () => {
    if (!pending) return;
    const action = pending;
    void run(async () => {
      if (action.kind === 'leave') await onLeave();
      else if (action.kind === 'remove') await onRemoveMember(action.member._id);
      else await onTransferOwner(action.member._id);
      setPending(null);
    });
  };

  const saveName = () => {
    const name = nameDraft.trim();
    if (!name || name === groupName) {
      setEditingName(false);
      setNameDraft(groupName);
      return;
    }
    void run(async () => {
      await onRename(name);
      setEditingName(false);
    });
  };

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
    void run(async () => {
      await onAddMembers(selectedIds);
      setAdding(false);
      setSelectedIds([]);
    });
  };

  const pendingText =
    pending?.kind === 'remove'
      ? `Xóa ${nameOf(pending.member)} khỏi nhóm?`
      : pending?.kind === 'transfer'
        ? `Chuyển quyền trưởng nhóm cho ${nameOf(pending.member)}? Bạn sẽ trở thành thành viên thường.`
        : pending?.kind === 'leave'
          ? members.length === 1
            ? 'Bạn là thành viên cuối cùng. Rời nhóm sẽ xóa nhóm và toàn bộ tin nhắn.'
            : 'Rời nhóm? Bạn sẽ không xem được tin nhắn của nhóm nữa.'
          : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs" onClick={onClose}>
      <aside
        className="w-full max-w-sm h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="Thông tin nhóm"
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Thông tin nhóm</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Name */}
          <section className="flex flex-col items-center text-center gap-2">
            <UserAvatar name={groupName} size="lg" />
            {editingName ? (
              <div className="w-full flex items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNameDraft(groupName);
                    }
                  }}
                  maxLength={100}
                  autoFocus
                  className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/30"
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={busy || !nameDraft.trim()}
                  className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white"
                  aria-label="Lưu tên nhóm"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-base font-bold text-slate-900 dark:text-white break-all">{groupName}</p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(groupName);
                      setEditingName(true);
                    }}
                    className="p-1 text-slate-400 hover:text-sky-500 rounded-lg"
                    title="Đổi tên nhóm"
                    aria-label="Đổi tên nhóm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-500">{members.length} thành viên</p>
          </section>

          {/* Add members (owner) */}
          {isOwner && (
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
                    <p className="text-[11px] text-slate-500 py-2 text-center">
                      Không còn bạn bè nào ngoài nhóm.
                    </p>
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
                              <span className="text-xs text-slate-800 dark:text-slate-200 truncate">
                                {nameOf(friend)}
                              </span>
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
          )}

          {/* Members */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Thành viên</p>
            <ul className="space-y-1">
              {sortedMembers.map((member) => {
                const memberIsOwner = member._id === ownerId;
                const isMe = member._id === currentUserId;
                return (
                  <li
                    key={member._id}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <UserAvatar
                      src={member.avatarUrl}
                      name={nameOf(member)}
                      size="sm"
                      status="online"
                      showStatus={!!onlineIds?.has(member._id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {nameOf(member)}
                        {isMe && <span className="ml-1 font-normal text-slate-400">(Bạn)</span>}
                      </p>
                      {memberIsOwner && (
                        <p className="flex items-center gap-1 text-[10px] text-amber-500">
                          <Crown className="w-3 h-3" /> Trưởng nhóm
                        </p>
                      )}
                    </div>
                    {isOwner && !isMe && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPending({ kind: 'transfer', member })}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"
                          title="Chuyển quyền trưởng nhóm"
                          aria-label={`Chuyển quyền trưởng nhóm cho ${nameOf(member)}`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending({ kind: 'remove', member })}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                          title="Xóa khỏi nhóm"
                          aria-label={`Xóa ${nameOf(member)} khỏi nhóm`}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Footer: confirmation or leave */}
        <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
          {pending ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-slate-200">{pendingText}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={confirmPending}
                  disabled={busy}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                    pending.kind === 'transfer' ? 'bg-amber-500 hover:bg-amber-400' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Xác nhận
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPending({ kind: 'leave' })}
                disabled={busy || ownerMustTransfer}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <LogOut className="w-4 h-4" />
                Rời nhóm
              </button>
              {ownerMustTransfer && (
                <p className="mt-1 text-[11px] text-center text-slate-500">
                  Hãy chuyển quyền trưởng nhóm cho thành viên khác trước khi rời nhóm.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
