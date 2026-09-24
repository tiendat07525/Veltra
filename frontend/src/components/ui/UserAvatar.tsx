import React, { useState } from 'react';
import { UserStatus } from '@/types/user';
import { OnlineStatusDot } from './OnlineStatusDot';

interface UserAvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: UserStatus;
  showStatus?: boolean;
  className?: string;
  id?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  showStatus = false,
  className = '',
  id,
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base font-semibold',
    xl: 'w-20 h-20 text-xl font-bold',
  };

  const dotSizes: Record<string, 'sm' | 'md' | 'lg'> = {
    xs: 'sm',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    xl: 'lg',
  };

  // Generate deterministic gradient background for fallback avatar
  const getInitials = (n: string) => {
    if (!n) return 'V';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  };

  return (
    <div id={id} className={`relative shrink-0 select-none ${sizeClasses[size]} ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-2xl object-cover ring-1 ring-slate-200/50 dark:ring-slate-800/80 shadow-xs"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white font-medium shadow-xs ring-1 ring-sky-400/20">
          {getInitials(name)}
        </div>
      )}

      {showStatus && status && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10">
          <OnlineStatusDot status={status} size={dotSizes[size]} />
        </div>
      )}
    </div>
  );
};
