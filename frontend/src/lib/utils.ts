export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Missing in older browsers (Firefox < 125): code points are used there
const graphemes =
  typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
// What a reader sees as one character: an accented letter or a whole emoji, never half of it
const firstCharacters = (text: string, count: number) =>
  (graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : Array.from(text)).slice(0, count).join('');

// Letters of an avatar without a picture: first character of the first two words ("Nhóm Đồ Án" → "NĐ"),
// or the first two characters of a single word ("Veltra" → "VE")
export function initialsOf(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  if (!first) return 'V';
  const initials = second ? firstCharacters(first, 1) + firstCharacters(second, 1) : firstCharacters(first, 2);
  return initials.toUpperCase();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// 24h "17:14" in the viewer's local time (built by hand: vi-VN Intl output varies by engine)
export function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch {
    return dateStr;
  }
}

// "Hôm nay" / "Hôm qua" / "25/11" (+ "/2025" for another year), local time
export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hôm nay';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    const dm = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    return d.getFullYear() === today.getFullYear() ? dm : `${dm}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

// Conversation list: "17:14" today, otherwise the day ("Hôm qua", "25/11")
export function formatListTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toDateString() === new Date().toDateString() ? formatTime(dateStr) : formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

// UUIDv7 (RFC 9562): 48-bit Unix ms timestamp, then random bits. Used as a message's clientMsgId.
export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Timestamp written with % and / because bitwise ops would truncate it to 32 bits
  let ts = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

