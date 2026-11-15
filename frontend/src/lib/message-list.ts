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
