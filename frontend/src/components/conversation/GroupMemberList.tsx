'use client';

import React, { useMemo } from 'react';
import { Crown, UserMinus } from 'lucide-react';
import { ConversationParticipant } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';

export const nameOf = (user: { displayName?: string; username?: string }) =>
  user.displayName || user.username || 'Người dùng';

interface GroupMemberListProps {
  members: ConversationParticipant[];
  ownerId?: string;
  currentUserId: string;
  // The viewer owns the group: shows transfer / remove on the other members
  isOwner: boolean;
  // Online members (usePresence)
  onlineIds?: Set<string>;
  busy: boolean;
  // Ask for confirmation (GroupInfoPanel footer); nothing is changed here
  onTransfer: (member: ConversationParticipant) => void;
  onRemove: (member: ConversationParticipant) => void;
}

// Members with online dot and owner badge; the owner gets transfer / remove buttons
export const GroupMemberList: React.FC<GroupMemberListProps> = ({
  members,
  ownerId,
  currentUserId,
  isOwner,
  onlineIds,
  busy,
  onTransfer,
  onRemove,
}) => {
  // Owner first, then by join order as the server returns them
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => Number(b._id === ownerId) - Number(a._id === ownerId)),
    [members, ownerId]
  );

  return (
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
                    onClick={() => onTransfer(member)}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"
                    title="Chuyển quyền trưởng nhóm"
                    aria-label={`Chuyển quyền trưởng nhóm cho ${nameOf(member)}`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(member)}
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
  );
};
