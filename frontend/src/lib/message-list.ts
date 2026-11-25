import { Message } from '@/types/message';

// Retry only when the server may not have stored the message: network error, timeout, 5xx.
// A 4xx means the request itself is rejected; resending it would fail the same way.
export function isRetryableSendError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === undefined || status >= 500;
}

// Put a stored message into the list. The list holds stored messages in ascending seq, then
// optimistic ones (no seq yet) at the end. The REST response and the `message:new` event carry the
// same message: whichever arrives first replaces the optimistic copy (same clientMsgId), the other
// replaces it again with an identical copy. The client never assigns seq, it only places by it.
export function upsertMessage(list: Message[], msg: Message): Message[] {
  const isSame = (m: Message) =>
    String(m._id) === String(msg._id) || (!!msg.clientMsgId && m.clientMsgId === msg.clientMsgId);

  if (msg.seq === undefined) {
    const idx = list.findIndex(isSame);
    if (idx === -1) return [...list, msg];
    const next = list.slice();
    next[idx] = msg;
    return next;
  }

  const seq = msg.seq;
  const rest = list.filter((m) => !isSame(m));
  // Before the first message with a higher seq, or before the optimistic tail
  const at = rest.findIndex((m) => m.seq === undefined || m.seq > seq);
  return at === -1 ? [...rest, msg] : [...rest.slice(0, at), msg, ...rest.slice(at)];
}

// Put the newest page of history into what is already held: messages that arrived by socket while the
// page was loading are newer than its last message and stay; everything else comes from the page.
export function mergeNewestPage(held: Message[], page: Message[]): Message[] {
  const lastSeq = page[page.length - 1]?.seq ?? 0;
  const pageIds = new Set(page.map((m) => String(m._id)));
  const newer = held.filter((m) => m.seq !== undefined && m.seq > lastSeq && !pageIds.has(String(m._id)));
  return [...page, ...newer];
}

// Put an older page in front, without the messages already held
export function prependOlderPage(held: Message[], page: Message[]): Message[] {
  const heldIds = new Set(held.map((m) => String(m._id)));
  return [...page.filter((m) => !heldIds.has(String(m._id))), ...held];
}

// A message is never un-revoked: a response built before the revoke must not bring its content back.
// `revoked` maps message id -> the text shown instead.
export function applyRevokes(list: Message[], revoked: ReadonlyMap<string, string>): Message[] {
  if (revoked.size === 0) return list;
  return list.map((m) => {
    const content = revoked.get(String(m._id));
    return content === undefined ? m : { ...m, isRevoked: true, content, attachments: undefined };
  });
}

// Stored messages, then this conversation's unsent ones (never the ones already stored)
export function withOutbox(stored: Message[], outbox: Message[], conversationId: string): Message[] {
  const unsent = outbox.filter((m) => m.conversationId === conversationId);
  if (unsent.length === 0) return stored;
  const storedKeys = new Set(stored.map((m) => m.clientMsgId));
  return [...stored, ...unsent.filter((m) => !storedKeys.has(m.clientMsgId))];
}

// The seq up to which nothing is missing, counted from the oldest message held (seq has no gaps on the
// server). undefined when nothing stored is held.
export function contiguousTop(list: Message[]): number | undefined {
  let top: number | undefined;
  for (const { seq } of list) {
    if (seq === undefined) break;
    if (top !== undefined && seq > top + 1) break;
    top = seq;
  }
  return top;
}

// A message between two held ones never arrived
export function hasGap(list: Message[]): boolean {
  let last: number | undefined;
  for (const { seq } of list) {
    if (seq !== undefined && (last === undefined || seq > last)) last = seq;
  }
  return last !== contiguousTop(list);
}

// Held messages and a freshly read stretch of history; the fresh copy of a message wins
export function mergeBySeq(held: Message[], fresh: Message[]): Message[] {
  const bySeq = new Map<number, Message>();
  for (const m of [...held, ...fresh]) if (m.seq !== undefined) bySeq.set(m.seq, m);
  return [...bySeq.entries()].sort(([a], [b]) => a - b).map(([, m]) => m);
}
