import React, { useState } from 'react';
import Image from 'next/image';
import { UserStatus } from '@/types/user';
import { initialsOf } from '@/lib/utils';
import { OnlineStatusDot } from './OnlineStatusDot';

interface UserAvatarProps {
  src?: string;
  name: string;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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
  // The src that failed to load: a new one is tried again
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const sizeClasses = {
    // Read receipts under a message
    xxs: 'w-4 h-4 text-[7px]',
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base font-semibold',
    xl: 'w-20 h-20 text-xl font-bold',
  };

  const dotSizes: Record<string, 'sm' | 'md' | 'lg'> = {
    xxs: 'sm',
    xs: 'sm',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    xl: 'lg',
  };

  return (
    <div id={id} className={`relative shrink-0 select-none ${sizeClasses[size]} ${className}`}>
      {src && src !== failedSrc ? (
        <Image
          src={src}
          alt={name}
          fill
          unoptimized
          onError={() => setFailedSrc(src)}
          className="rounded-2xl object-cover ring-1 ring-slate-200/50 dark:ring-slate-800/80 shadow-xs"
        />
      ) : (
        <div className="w-full h-full rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white font-medium shadow-xs ring-1 ring-sky-400/20">
          {initialsOf(name)}
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
