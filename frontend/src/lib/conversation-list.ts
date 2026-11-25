import { Conversation } from '@/types/conversation';

// Insert or replace a conversation from the server (conversation:updated or a group-change response).
// If the list already holds a newer message (higher lastSeq), keep its message fields and take
// only the membership / group fields from the incoming copy.
export function upsertConversation(prev: Conversation[], incoming: Conversation): Conversation[] {
  const index = prev.findIndex((c) => c._id === incoming._id);
  if (index === -1) return [incoming, ...prev];

  const current = prev[index];
  const merged: Conversation =
    (current.lastSeq ?? 0) > (incoming.lastSeq ?? 0)
      ? {
          ...incoming,
          lastMessage: current.lastMessage,
          lastMessageAt: current.lastMessageAt,
          lastSeq: current.lastSeq,
          unreadCounts: current.unreadCounts,
        }
      : incoming;
  const next = [...prev];
  next[index] = merged;
  return next;
}

/**
 * The list read from the server (`incoming`), with what changed here while the request ran:
 * `before` is the list when it was sent, `current` the list now.
 */
export function mergeConversationList(
  before: Conversation[],
  current: Conversation[],
  incoming: Conversation[],
  currentUserId: string | null
): Conversation[] {
  const beforeIds = new Set(before.map((c) => c._id));
  const currentById = new Map(current.map((c) => [c._id, c]));
  const serverById = new Map(incoming.map((c) => [c._id, c]));

  // Newer here: joined / created, or got a message / group change, after the server built its answer
  const newer = current.filter((c) => {
    const server = serverById.get(c._id);
    return server ? (c.lastSeq ?? 0) > (server.lastSeq ?? 0) : !beforeIds.has(c._id);
  });
  const newerIds = new Set(newer.map((c) => c._id));

  const rest = incoming
    // Left / removed / deleted while the request ran
    .filter((c) => !newerIds.has(c._id) && !(beforeIds.has(c._id) && !currentById.has(c._id)))
    .map((c) => {
      const held = currentById.get(c._id);
      const heldUnread = currentUserId ? held?.unreadCounts?.[currentUserId] : undefined;
      const unread = currentUserId ? c.unreadCounts?.[currentUserId] : undefined;
      // Same newest message: my unread count only goes down, so the lower one is the later one
      if (!currentUserId || !held || held.lastSeq !== c.lastSeq || heldUnread === undefined || unread === undefined) return c;
      return heldUnread < unread ? { ...c, unreadCounts: { ...c.unreadCounts, [currentUserId]: heldUnread } } : c;
    });
  return [...newer, ...rest];
}
