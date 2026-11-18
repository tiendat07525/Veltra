'use client';

import React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FriendRequest } from '@/types/friend';
import { InlineError } from '@/components/ui/InlineError';

interface FriendRequestsTabProps {
  receivedRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  actionLoading: boolean;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
  // Action errors by request id (ContactsView)
  rowErrors: Record<string, string>;
  onDismissError: (id: string) => void;
}

// Received requests (accept / decline) and sent requests (pending)
export const FriendRequestsTab: React.FC<FriendRequestsTabProps> = ({
  receivedRequests,
  sentRequests,
  actionLoading,
  onAcceptRequest,
  onDeclineRequest,
  rowErrors,
  onDismissError,
}) => (
  <div className="p-4 space-y-4">
    {/* Received Requests */}
    <div>
      <h3 className="text-xs font-bold text-fg-muted uppercase tracking-wider px-1 mb-2">
        Lời mời nhận được ({receivedRequests.length})
      </h3>
      {receivedRequests.length === 0 ? (
        <p className="text-xs text-fg-muted px-1">Không có lời mời nào</p>
      ) : (
        <div className="space-y-1">
          {receivedRequests.map((req) => {
            const sender = typeof req.from === 'object' ? req.from : null;
            return (
              <div key={req._id}>
                <div
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-line"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={sender?.avatarUrl}
                      name={sender?.displayName || sender?.username || ''}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-fg truncate">
                        {sender?.displayName || sender?.username || 'Người dùng'}
                      </h4>
                      {req.message && (
                        <p className="text-xs text-fg-muted truncate italic">&ldquo;{req.message}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onAcceptRequest(req._id)}
                      disabled={actionLoading}
                      aria-label="Chấp nhận lời mời"
                      className="flex items-center justify-center gap-1 min-h-9 min-w-9 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-[11px] font-semibold disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Chấp nhận</span>
                    </button>
                    <button
                      onClick={() => onDeclineRequest(req._id)}
                      disabled={actionLoading}
                      aria-label="Từ chối lời mời"
                      className="flex items-center justify-center gap-1 min-h-9 min-w-9 px-2.5 rounded-lg bg-surface-2 hover:bg-line text-fg text-[11px] font-semibold disabled:opacity-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Từ chối</span>
                    </button>
                  </div>
                </div>
              <InlineError
                message={rowErrors[req._id]}
                onDismiss={() => onDismissError(req._id)}
                className="mt-1"
              />
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Sent Requests */}
    <div>
      <h3 className="text-xs font-bold text-fg-muted uppercase tracking-wider px-1 mb-2">
        Lời mời đã gửi ({sentRequests.length})
      </h3>
      {sentRequests.length === 0 ? (
        <p className="text-xs text-fg-muted px-1">Không có lời mời nào</p>
      ) : (
        <div className="space-y-1">
          {sentRequests.map((req) => {
            const receiver = typeof req.to === 'object' ? req.to : null;
            return (
              <div
                key={req._id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-line"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    src={receiver?.avatarUrl}
                    name={receiver?.displayName || receiver?.username || ''}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm text-fg truncate">
                      {receiver?.displayName || receiver?.username || 'Người dùng'}
                    </h4>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-fg-muted font-medium shrink-0">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Đang chờ
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
