'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatCallDuration, mediaLabel } from '@/lib/call-format';
import type { CallView } from '@/hooks/use-call';

interface CallScreenProps {
  view: CallView;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onResume: () => void;
  onToggleMic: () => void;
}

// Seconds since `from` (local clock), updated every second
function CallTimer({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{formatCallDuration((now - from) / 1000)}</span>;
}

const statusText = (view: CallView): string | null => {
  switch (view.phase) {
    case 'preparing':
      return 'Đang chuẩn bị…';
    case 'outgoing':
      return 'Đang đổ chuông…';
    case 'incoming':
      return `${mediaLabel(view.media)} đến`;
    case 'connecting':
      return 'Đang kết nối…';
    case 'reconnecting':
      return 'Mất kết nối, đang kết nối lại…';
    case 'ended':
      return view.message;
    default:
      return null;
  }
};

// The other side's audio; a blocked autoplay (page reloaded without a click) needs one tap
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      el.play().then(
        () => setBlocked(false),
        () => setBlocked(true)
      );
    }
  }, [stream]);
  return (
    <>
      <audio ref={ref} autoPlay className="hidden" />
      {blocked && (
        <button
          type="button"
          onClick={() => void ref.current?.play().then(() => setBlocked(false), () => undefined)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
        >
          <Volume2 className="w-4 h-4" />
          Bấm để bật âm thanh
        </button>
      )}
    </>
  );
}

const roundButton = 'w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/**
 * The call on screen: incoming (accept / decline), ringing, in call (mic, hang up), the ended note,
 * or a small bar for a call carried by another tab / before a reload ("Tiếp tục ở đây").
 */
export const CallScreen: React.FC<CallScreenProps> = ({ view, onAccept, onDecline, onHangUp, onResume, onToggleMic }) => {
  const name = view.peer.displayName || view.peer.username;

  if (view.phase === 'resumable') {
    return (
      <div
        role="status"
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1rem)] max-w-md rounded-2xl bg-[#14162a] text-white shadow-lg px-4 py-3 flex items-center gap-3"
      >
        <Phone className="w-5 h-5 shrink-0 text-green-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">Đang trong cuộc gọi với {name}</p>
          <p className="text-[11px] text-white/70 truncate">{view.message ?? 'Cuộc gọi đang diễn ra ở thẻ hoặc thiết bị khác'}</p>
        </div>
        <button
          type="button"
          onClick={onResume}
          className="shrink-0 rounded-full bg-green-600 hover:bg-green-500 px-3 py-1.5 text-xs font-semibold"
        >
          Tiếp tục ở đây
        </button>
        <button
          type="button"
          onClick={onHangUp}
          className="shrink-0 rounded-full bg-red-600 hover:bg-red-500 p-2"
          aria-label="Kết thúc cuộc gọi"
          title="Kết thúc cuộc gọi"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const status = statusText(view);
  const inCall = view.phase === 'connected' || view.phase === 'connecting' || view.phase === 'reconnecting';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mediaLabel(view.media)} với ${name}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-[#0f1020] text-white px-6 py-12 select-none"
    >
      <div className="flex flex-col items-center text-center mt-8 min-w-0 max-w-full">
        <div className={view.phase === 'incoming' || view.phase === 'outgoing' ? 'animate-pulse' : ''}>
          <UserAvatar src={view.peer.avatarUrl ?? undefined} name={name} size="xl" />
        </div>
        <h2 className="mt-5 text-xl font-bold truncate max-w-full">{name}</h2>
        <p className="mt-1 text-sm text-white/75 min-h-5" aria-live="polite">
          {view.phase === 'connected' && view.connectedAt ? <CallTimer from={view.connectedAt} /> : status}
        </p>
        {inCall && view.remoteMicMuted && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/70">
            <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
            {name} đã tắt micro
          </p>
        )}
        <RemoteAudio stream={view.remoteStream} />
      </div>

      {view.phase === 'incoming' ? (
        <div className="flex items-center gap-16">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onDecline} className={`${roundButton} bg-red-600 hover:bg-red-500`} aria-label="Từ chối">
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-xs text-white/80">Từ chối</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onAccept} className={`${roundButton} bg-green-600 hover:bg-green-500`} aria-label="Trả lời">
              <Phone className="w-6 h-6" />
            </button>
            <span className="text-xs text-white/80">Trả lời</span>
          </div>
        </div>
      ) : view.phase === 'ended' ? (
        <button
          type="button"
          onClick={onHangUp}
          className="rounded-full bg-white/15 hover:bg-white/25 px-6 py-2.5 text-sm font-semibold"
        >
          Đóng
        </button>
      ) : (
        <div className="flex items-center gap-8">
          <button
            type="button"
            onClick={onToggleMic}
            disabled={!inCall && view.phase !== 'outgoing'}
            className={`${roundButton} ${view.micMuted ? 'bg-white text-[#0f1020]' : 'bg-white/15 hover:bg-white/25'} disabled:opacity-40`}
            aria-label={view.micMuted ? 'Bật micro' : 'Tắt micro'}
            aria-pressed={view.micMuted}
            title={view.micMuted ? 'Bật micro' : 'Tắt micro'}
          >
            {view.micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <button
            type="button"
            onClick={onHangUp}
            className={`${roundButton} bg-red-600 hover:bg-red-500`}
            aria-label={view.phase === 'outgoing' || view.phase === 'preparing' ? 'Hủy cuộc gọi' : 'Kết thúc cuộc gọi'}
            title={view.phase === 'outgoing' || view.phase === 'preparing' ? 'Hủy cuộc gọi' : 'Kết thúc cuộc gọi'}
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
};
