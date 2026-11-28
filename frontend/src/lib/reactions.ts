import type { Message, MessageReaction, ReactionEmoji, ReactionUpdate } from '@/types/message';

// Same set and order as the server (message.schema.ts REACTION_EMOJIS)
export const REACTION_EMOJIS: readonly ReactionEmoji[] = ['👍', '❤️', '😂', '😮', '😢'];

// Newest reactions known per message id (from events and own PUT / DELETE responses)
export type KnownReactions = ReadonlyMap<string, { reactions: MessageReaction[]; version: number }>;

// One chip under a bubble
export interface ReactionGroup {
  emoji: ReactionEmoji;
  count: number;
  // The current user is one of them
  mine: boolean;
  // In reaction order
  userIds: string[];
}

// Chips in the fixed emoji order (so they do not jump around), only emoji someone used
export function groupReactions(reactions: MessageReaction[] | undefined, myId: string | null): ReactionGroup[] {
  if (!reactions?.length) return [];
  return REACTION_EMOJIS.flatMap((emoji) => {
    const userIds = reactions.filter((r) => r.emoji === emoji).map((r) => String(r.userId));
    if (userIds.length === 0) return [];
    return [{ emoji, count: userIds.length, mine: !!myId && userIds.includes(String(myId)), userIds }];
  });
}

// My emoji on this message, if any
export function myReaction(reactions: MessageReaction[] | undefined, myId: string | null): ReactionEmoji | null {
  if (!myId) return null;
  return reactions?.find((r) => String(r.userId) === String(myId))?.emoji ?? null;
}

// Keeps an update only if it is newer than what is known for that message
export function rememberReactions(known: KnownReactions, update: ReactionUpdate): KnownReactions {
  const held = known.get(String(update.messageId));
  if (held && held.version >= update.reactionsVersion) return known;
  return new Map(known).set(String(update.messageId), {
    reactions: update.reactions,
    version: update.reactionsVersion,
  });
}

// Puts known reactions on the messages they are newer than. A message from a response that is newer
// (higher reactionsVersion) keeps its own; revoked messages never show reactions.
export function applyReactions(list: Message[], known: KnownReactions): Message[] {
  if (known.size === 0) return list;
  let changed = false;
  const next = list.map((m) => {
    const held = known.get(String(m._id));
    if (!held || m.isRevoked || held.version <= (m.reactionsVersion ?? 0)) return m;
    changed = true;
    return {
      ...m,
      reactions: held.reactions.length ? held.reactions : undefined,
      reactionsVersion: held.version,
    };
  });
  return changed ? next : list;
}
