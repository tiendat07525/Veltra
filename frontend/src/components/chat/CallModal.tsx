import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatDuration } from '@/lib/utils';

interface CallModalProps {
  isOpen: boolean;
  type: 'voice' | 'video';
  contactName: string;
  contactAvatar: string;
  onEndCall: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  type,
  contactName,
  contactAvatar,
  onEndCall,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDuration(0);
      return;
    }
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Video feed placeholder (Frontend Only) */}
        {type === 'video' && !isVideoOff ? (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/60 mb-6 shadow-inner flex items-center justify-center">
            <img
              src={contactAvatar}
              alt={contactName}
              className="w-full h-full object-cover filter blur-xs brightness-75"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/30 backdrop-blur-xs">
              <UserAvatar src={contactAvatar} name={contactName} size="xl" className="mb-3 ring-4 ring-sky-500/40" />
              <p className="font-semibold text-lg">{contactName}</p>
              <span className="text-xs text-sky-400 font-mono mt-1">720p HD • WebRTC Secure</span>
            </div>

            {/* Self preview PIP */}
            <div className="absolute bottom-3 right-3 w-28 h-20 bg-slate-950/80 rounded-xl border border-white/20 overflow-hidden flex items-center justify-center text-[10px] text-slate-300">
              <span>Bạn</span>
            </div>
          </div>
        ) : (
          <div className="relative mb-6 mt-4">
            <div className="absolute -inset-3 bg-sky-500/20 rounded-full animate-ping opacity-50" />
            <UserAvatar
              src={contactAvatar}
              name={contactName}
              size="xl"
              className="w-24 h-24 ring-4 ring-sky-500/40 relative"
            />
          </div>
        )}

        <h2 className="text-2xl font-bold text-white tracking-tight mb-1">{contactName}</h2>
        <p className="text-xs text-sky-400 font-medium tracking-wide uppercase mb-3">
          {type === 'video' ? 'Cuộc gọi video bảo mật' : 'Cuộc gọi thoại bảo mật'}
        </p>

        <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-sm font-mono text-slate-200 mb-8">
          {formatDuration(duration)}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title={isMuted ? 'Bật mic' : 'Tắt mic'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {type === 'video' && (
            <button
              type="button"
              onClick={() => setIsVideoOff((v) => !v)}
              className={`w-13 h-13 rounded-full flex items-center justify-center transition-all ${
                isVideoOff
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
              title={isVideoOff ? 'Bật camera' : 'Tắt camera'}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            className="w-13 h-13 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center transition-colors"
            title="Loa ngoài"
          >
            <Volume2 className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onEndCall}
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all hover:scale-105 active:scale-95"
            title="Kết thúc cuộc gọi"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
