'use client';

import React from 'react';
import { ConversationParticipant } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MAX_READER_AVATARS } from '@/lib/receipts';

const nameOf = (p: ConversationParticipant) => p.displayName || p.username || 'Người dùng';

// Direct: "Đã gửi" / "Đã xem" under my newest message
export const DirectReceipt: React.FC<{ seen: boolean }> = ({ seen }) => (
  <p className="-mt-1 mb-2 pr-1 text-right text-[11px] text-fg-muted select-none">{seen ? 'Đã xem' : 'Đã gửi'}</p>
);

// Group: small avatars of the members who read up to this message (names on hover)
export const GroupReaders: React.FC<{ readers: ConversationParticipant[] }> = ({ readers }) => {
  const names = readers.map(nameOf).join(', ');
  const shown = readers.slice(0, MAX_READER_AVATARS);
  const more = readers.length - shown.length;
  return (
    <div
      role="img"
      aria-label={`Đã xem: ${names}`}
      title={`Đã xem: ${names}`}
      className="-mt-1 mb-2 pr-1 flex items-center justify-end gap-0.5 select-none"
    >
      {shown.map((p) => (
        <UserAvatar key={p._id} src={p.avatarUrl || undefined} name={nameOf(p)} size="xxs" />
      ))}
      {more > 0 && <span className="ml-0.5 text-[10px] font-semibold text-fg-muted">+{more}</span>}
    </div>
  );
};
