import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface VoiceNotePlayerProps {
  duration?: number;
  isCurrentUser?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  duration = 32,
  isCurrentUser = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0); // 0 to 100
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<any>(null);

  // Generate deterministic simulated audio bars
  const bars = [35, 60, 45, 80, 50, 90, 70, 40, 85, 95, 60, 45, 75, 55, 65, 80, 40, 70, 90, 50];

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            setCurrentProgress(0);
            return 0;
          }
          const next = prev + 1;
          setCurrentProgress((next / duration) * 100);
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, duration]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[220px]">
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
          isCurrentUser
            ? 'bg-white text-sky-600 hover:bg-slate-100'
            : 'bg-sky-500 text-white hover:bg-sky-600'
        }`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1.5">
        {/* Animated Waveform Bars */}
        <div className="flex items-center gap-1 h-7">
          {bars.map((barHeight, idx) => {
            const barProgress = (idx / bars.length) * 100;
            const isPassed = currentProgress >= barProgress;

            return (
              <span
                key={idx}
                style={{ height: `${barHeight}%` }}
                className={`w-1 rounded-full transition-colors duration-150 ${
                  isCurrentUser
                    ? isPassed
                      ? 'bg-white'
                      : 'bg-white/40'
                    : isPassed
                    ? 'bg-sky-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] opacity-80 font-medium">
          <span>{formatDuration(currentTime)}</span>
          <span className="flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};
