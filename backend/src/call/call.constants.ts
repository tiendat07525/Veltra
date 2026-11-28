// 1-1 calls (message_logic.md §9, realtime.md §4 Calls). Times in ms unless named _S.

// Unanswered for this long → ended as missed
export const RING_TIMEOUT_MS = 45_000;
// The joined socket of a party is gone: wait this long for the same user to join again
export const REJOIN_GRACE_MS = 30_000;
// Redis keys of a call (call:{id}, call:user:{id}); call:join (sent every 30 s by the client) renews it
export const CALL_KEY_TTL_S = 90;
// Lifetime of the TURN credentials handed to the client (Cloudflare allows up to 48 h)
export const TURN_CREDENTIAL_TTL_S = 7_200;
export const TURN_REQUEST_TIMEOUT_MS = 5_000;

// call:signal: one JSON payload at most this long, at most SIGNAL_LIMIT per socket per window
export const SIGNAL_MAX_BYTES = 16_384;
export const SIGNAL_LIMIT = 50;
export const SIGNAL_WINDOW_MS = 1_000;
// call:join: at most JOIN_LIMIT per socket per window
export const JOIN_LIMIT = 10;
export const JOIN_WINDOW_MS = 10_000;

export const CALL_MEDIA = ['audio', 'video'] as const;
export type CallMedia = (typeof CALL_MEDIA)[number];
export type CallState = 'ringing' | 'active';
export type CallRole = 'caller' | 'callee';

// Why a call ended (sent in call:updated); stored as a call message with the matching status
export type CallEndReason =
  | 'ended' // hung up while active
  | 'dropped' // a party's socket did not come back in time
  | 'canceled' // the caller hung up while ringing
  | 'missed' // nobody answered in time
  | 'declined' // the callee refused
  | 'busy'; // the callee was in another call
