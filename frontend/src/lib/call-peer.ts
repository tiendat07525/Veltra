import { CallIceServer, CallSignal } from '@/types/call';

export interface CallPeerOptions {
  iceServers: CallIceServer[];
  localStream: MediaStream;
  send: (signal: CallSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  // Tests pass a fake
  createConnection?: (config: RTCConfiguration) => RTCPeerConnection;
}

const MAX_EARLY = 100;

const newSid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * One WebRTC connection to the other party, rebuilt on every negotiation:
 * the caller sends an offer (first time, after either side re-joined, after an ICE failure),
 * the callee answers every offer on a fresh connection. Each connection has a session id (`sid`),
 * so answers / candidates of an older connection are dropped. Media always goes through TURN
 * (`iceTransportPolicy: 'relay'`): peers never see each other's IP address.
 */
export class CallPeer {
  private pc: RTCPeerConnection | null = null;
  private sid: string | null = null;
  // Candidates that arrived before the remote description
  private pending: RTCIceCandidateInit[] = [];
  // Candidates of a connection not created yet: the server relays signals concurrently, so a
  // candidate can overtake its offer. Kept for one sid only, at most MAX_EARLY.
  private early: { sid: string; list: RTCIceCandidateInit[] } | null = null;
  private closed = false;

  constructor(private readonly options: CallPeerOptions) {}

  // Caller: start a new negotiation
  async offer(): Promise<void> {
    const pc = this.reset(newSid());
    const sid = this.sid!;
    const offer = await pc.createOffer();
    if (this.pc !== pc) return;
    await pc.setLocalDescription(offer);
    if (this.pc !== pc) return;
    this.options.send({ type: 'offer', sid, sdp: offer.sdp ?? '' });
  }

  async handle(signal: CallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.type === 'offer') {
      const pc = this.reset(signal.sid);
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await this.flush(pc);
      if (this.pc !== pc) return;
      const answer = await pc.createAnswer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription(answer);
      if (this.pc !== pc) return;
      this.options.send({ type: 'answer', sid: signal.sid, sdp: answer.sdp ?? '' });
      return;
    }
    if (signal.type === 'answer') {
      const pc = this.pc;
      if (!pc || signal.sid !== this.sid || pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      await this.flush(pc);
      return;
    }
    if (signal.type === 'candidate') {
      const pc = this.pc;
      if (!pc || signal.sid !== this.sid) {
        if (this.early?.sid !== signal.sid) this.early = { sid: signal.sid, list: [] };
        if (this.early.list.length < MAX_EARLY) this.early.list.push(signal.candidate);
        return;
      }
      if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => undefined);
      else this.pending.push(signal.candidate);
    }
  }

  close(): void {
    this.closed = true;
    this.pc?.close();
    this.pc = null;
    this.sid = null;
    this.pending = [];
    this.early = null;
  }

  private reset(sid: string): RTCPeerConnection {
    this.pc?.close();
    this.pending = this.early?.sid === sid ? this.early.list : [];
    this.early = null;
    this.sid = sid;
    const config: RTCConfiguration = {
      iceServers: this.options.iceServers,
      iceTransportPolicy: 'relay',
    };
    const pc = this.options.createConnection
      ? this.options.createConnection(config)
      : new RTCPeerConnection(config);
    this.pc = pc;
    for (const track of this.options.localStream.getTracks()) {
      pc.addTrack(track, this.options.localStream);
    }
    pc.onicecandidate = (event) => {
      if (this.pc !== pc || !event.candidate) return;
      this.options.send({ type: 'candidate', sid, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      if (this.pc !== pc) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.options.onRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (this.pc === pc) this.options.onConnectionState(pc.connectionState);
    };
    return pc;
  }

  private async flush(pc: RTCPeerConnection) {
    const list = this.pending;
    this.pending = [];
    for (const candidate of list) {
      if (this.pc !== pc) return;
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }
}
