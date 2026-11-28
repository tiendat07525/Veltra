// Ringtone (incoming) and ringback (outgoing) made with the Web Audio API, repeated until stopped

let context: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  return context;
};

const PATTERNS = {
  // Two short rising notes every 2 s
  ring: { every: 2000, notes: [[660, 0, 0.35], [880, 0.4, 0.35]] },
  // One long low tone every 3 s
  ringback: { every: 3000, notes: [[440, 0, 1.0]] },
} as const;

export type CallTone = keyof typeof PATTERNS;

// Starts the tone now; the returned function stops it
export function startCallTone(kind: CallTone): () => void {
  const ctx = getContext();
  if (!ctx) return () => undefined;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  const pattern = PATTERNS[kind];
  const play = () => {
    const start = ctx.currentTime;
    for (const [frequency, offset, length] of pattern.notes) {
      const at = start + offset;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.setValueAtTime(0.12, at + length - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + length + 0.01);
    }
  };
  play();
  const timer = setInterval(play, pattern.every);
  return () => clearInterval(timer);
}
