// Short two-note "ding" made with the Web Audio API (no audio file)

let context: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  return context;
};

export function playNotificationSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  // Browsers keep the context suspended until a user gesture has happened on the page
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const start = ctx.currentTime;
  [880, 1320].forEach((frequency, i) => {
    const at = start + i * 0.12;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.15, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.26);
  });
}
