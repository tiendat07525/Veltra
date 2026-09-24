import React from 'react';
import { UserStatus } from '@/types/user';

interface OnlineStatusDotProps {
  status?: UserStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const OnlineStatusDot: React.FC<OnlineStatusDotProps> = ({
  status = 'offline',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-2.5 h-2.5 ring-1.5',
    md: 'w-3.5 h-3.5 ring-2',
    lg: 'w-4 h-4 ring-2',
  };

  const normStatus = (status || 'Offline').toLowerCase();
  const validStatus = normStatus === 'online' ? 'online' : normStatus === 'away' ? 'away' : 'offline';

  const statusColors: Record<'online' | 'away' | 'offline', string> = {
    online: 'bg-emerald-500 shadow-sm shadow-emerald-500/50',
    away: 'bg-amber-500 shadow-sm shadow-amber-500/50',
    offline: 'bg-slate-400 dark:bg-slate-500',
  };

  const statusTitles: Record<'online' | 'away' | 'offline', string> = {
    online: 'Online',
    away: 'Away',
    offline: 'Offline',
  };

  return (
    <span
      title={statusTitles[validStatus]}
      className={`inline-block rounded-full ring-white dark:ring-slate-900 ${sizeClasses[size]} ${statusColors[validStatus]} ${className}`}
    />
  );
};
