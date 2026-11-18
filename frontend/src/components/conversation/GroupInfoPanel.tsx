'use client';

import React, { useState } from 'react';
import { Check, Loader2, LogOut, Pencil, X } from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { GroupMemberList, nameOf } from './GroupMemberList';
import { AddGroupMembers } from './AddGroupMembers';
import { InlineError } from '@/components/ui/InlineError';

interface GroupInfoPanelProps {
  conversation: Conversation;
  currentUserId: string;
  // Online members (usePresence)
  onlineIds?: Set<string>;
  onClose: () => void;
  // Each handler rejects with an Error whose message the panel shows next to the action
  onRename: (groupName: string) => Promise<void>;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onTransferOwner: (userId: string) => Promise<void>;
  onLeave: () => Promise<void>;
}

type PendingAction =
  | { kind: 'remove' | 'transfer'; member: ConversationParticipant }
  | { kind: 'leave' };

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
  // Failed action, shown where it was started: name field, add members, or the footer
  const [error, setError] = useState<{ area: 'name' | 'add' | 'footer'; message: string } | null>(null);

  // An owner can leave only as the last member (which deletes the group)
  const ownerMustTransfer = isOwner && members.length > 1;

  // Resolves true on success; on failure stores the error for `area` and resolves false
  const run = async (area: 'name' | 'add' | 'footer', action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err: unknown) {
      setError({ area, message: err instanceof Error && err.message ? err.message : 'Không thể cập nhật nhóm' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const errorFor = (area: 'name' | 'add' | 'footer') => (error?.area === area ? error.message : null);

  const confirmPending = () => {
    if (!pending) return;
    const action = pending;
    // The confirmation stays open on failure, with the error above its buttons
    void run('footer', async () => {
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
    void run('name', async () => {
      await onRename(name);
      setEditingName(false);
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
        className="w-full max-w-sm h-full flex flex-col bg-surface border-l border-line shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Thông tin nhóm"
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-line shrink-0">
          <h3 className="text-sm font-bold text-fg">Thông tin nhóm</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-fg-muted hover:text-fg hover:bg-surface-2 rounded-xl"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" aria-hidden="true" />
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
                  aria-label="Tên nhóm"
                  className="flex-1 min-w-0 min-h-10 px-3 py-2 bg-surface-2 rounded-xl text-sm text-fg focus:outline-hidden focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={busy || !nameDraft.trim()}
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-on-primary"
                  aria-label="Lưu tên nhóm"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-base font-bold text-fg break-words">{groupName}</p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(groupName);
                      setEditingName(true);
                    }}
                    className="p-1.5 text-fg-muted hover:text-accent hover:bg-accent-soft rounded-lg"
                    title="Đổi tên nhóm"
                    aria-label="Đổi tên nhóm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <InlineError message={errorFor('name')} onDismiss={() => setError(null)} className="w-full text-left" />
            <p className="text-[11px] text-fg-muted">{members.length} thành viên</p>
          </section>

          {/* Add members (owner) */}
          {isOwner && (
            <div className="space-y-2">
              <AddGroupMembers members={members} busy={busy} onAdd={(userIds) => run('add', () => onAddMembers(userIds))} />
              <InlineError message={errorFor('add')} onDismiss={() => setError(null)} />
            </div>
          )}

          <GroupMemberList
            members={members}
            ownerId={ownerId}
            currentUserId={currentUserId}
            isOwner={isOwner}
            onlineIds={onlineIds}
            busy={busy}
            onTransfer={(member) => setPending({ kind: 'transfer', member })}
            onRemove={(member) => setPending({ kind: 'remove', member })}
          />
        </div>

        {/* Footer: confirmation or leave */}
        <div className="px-4 py-3 border-t border-line shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <InlineError message={errorFor('footer')} onDismiss={() => setError(null)} className="mb-2" />
          {pending ? (
            <div className="space-y-2">
              <p className="text-xs text-fg">{pendingText}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setError(null);
                  }}
                  disabled={busy}
                  className="flex-1 min-h-10 rounded-xl bg-surface-2 hover:bg-line text-xs font-semibold text-fg"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={confirmPending}
                  disabled={busy}
                  className={`flex-1 min-h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                    pending.kind === 'transfer'
                      ? 'bg-primary hover:bg-primary-hover text-on-primary'
                      : 'bg-red-600 hover:bg-red-700 text-white'
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
                className="w-full flex items-center justify-center gap-2 min-h-10 rounded-xl text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <LogOut className="w-4 h-4" />
                Rời nhóm
              </button>
              {ownerMustTransfer && (
                <p className="mt-1 text-[11px] text-center text-fg-muted">
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
