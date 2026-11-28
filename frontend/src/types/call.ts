// 1-1 calls (backend: message_logic.md §9, events: realtime.md §4 Calls)
export type CallMedia = 'audio' | 'video';
export type CallState = 'ringing' | 'active' | 'ended';
export type CallRole = 'caller' | 'callee';
export type CallEndReason = 'ended' | 'dropped' | 'canceled' | 'missed' | 'declined';

export interface CallInfo {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  state: CallState;
  createdAt: string;
  acceptedAt?: string;
}

// The other party, as the server sends it (call:incoming, GET /call/active)
export interface CallPeerInfo {
  _id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface CallIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

// POST /call and POST /call/:id/accept
export interface CallStartResponse {
  call: CallInfo;
  iceServers: CallIceServer[];
}

// GET /call/active
export type ActiveCallResponse =
  | { call: null }
  | { call: CallInfo; peer: CallPeerInfo; iceServers?: CallIceServer[] };

export interface CallIncomingEvent {
  call: CallInfo;
  caller: CallPeerInfo;
}

export interface CallUpdatedEvent {
  call: CallInfo;
  reason?: CallEndReason;
  durationSec?: number;
}

// A finished call stored as a message (message.type === 'call')
export interface CallRecord {
  media: CallMedia;
  status: 'completed' | 'missed' | 'declined';
  durationSec?: number;
}

// What travels in call:signal `data` (opaque to the server)
export type CallSignal =
  | { type: 'offer'; sid: string; sdp: string }
  | { type: 'answer'; sid: string; sdp: string }
  | { type: 'candidate'; sid: string; candidate: RTCIceCandidateInit }
  // My mic / camera switched on or off, so the other side can show it
  | { type: 'state'; micMuted: boolean; cameraOff?: boolean };
