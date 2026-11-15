'use client';

import React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FriendRequest } from '@/types/friend';

interface FriendRequestsTabProps {
  receivedRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  actionLoading: boolean;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
}

// Received requests (accept / decline) and sent requests (pending)
export const FriendRequestsTab: React.FC<FriendRequestsTabProps> = ({
  receivedRequests,
  sentRequests,
  actionLoading,
  onAcceptRequest,
  onDeclineRequest,
}) => (
  <div className="p-4 space-y-4">
    {/* Received Requests */}
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
        Lời mời nhận được ({receivedRequests.length})
      </h3>
      {receivedRequests.length === 0 ? (
        <p className="text-xs text-slate-400 px-1">Không có lời mời nào</p>
      ) : (
        <div className="space-y-1">
          {receivedRequests.map((req) => {
            const sender = typeof req.from === 'object' ? req.from : null;
            return (
              <div
                key={req._id}
                className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    src={sender?.avatarUrl}
                    name={sender?.displayName || sender?.username || ''}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {sender?.displayName || sender?.username || 'Người dùng'}
                    </h4>
                    {req.message && (
                      <p className="text-xs text-slate-400 truncate italic">&ldquo;{req.message}&rdquo;</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onAcceptRequest(req._id)}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Chấp nhận
                  </button>
                  <button
                    onClick={() => onDeclineRequest(req._id)}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-[11px] font-medium disabled:opacity-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Từ chối
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Sent Requests */}
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
        Lời mời đã gửi ({sentRequests.length})
      </h3>
      {sentRequests.length === 0 ? (
        <p className="text-xs text-slate-400 px-1">Không có lời mời nào</p>
      ) : (
        <div className="space-y-1">
          {sentRequests.map((req) => {
            const receiver = typeof req.to === 'object' ? req.to : null;
            return (
              <div
                key={req._id}
                className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    src={receiver?.avatarUrl}
                    name={receiver?.displayName || receiver?.username || ''}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {receiver?.displayName || receiver?.username || 'Người dùng'}
                    </h4>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium shrink-0">
                  <Clock className="w-3.5 h-3.5" /> Đang chờ
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
