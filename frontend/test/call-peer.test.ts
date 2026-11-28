import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallPeer } from '@/lib/call-peer';
import type { CallSignal } from '@/types/call';

// Just enough of RTCPeerConnection to follow what CallPeer does
class FakePC {
  static all: FakePC[] = [];
  closed = false;
  signalingState: RTCSignalingState = 'stable';
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  added: unknown[] = [];
  candidates: RTCIceCandidateInit[] = [];
  connectionState: RTCPeerConnectionState = 'new';
  onicecandidate: ((e: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((e: { streams: unknown[]; track: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor(public config: RTCConfiguration) {
    FakePC.all.push(this);
  }
  addTrack(track: unknown) {
    this.added.push(track);
  }
  async createOffer() {
    return { type: 'offer' as const, sdp: `offer-${FakePC.all.indexOf(this)}` };
  }
  async createAnswer() {
    return { type: 'answer' as const, sdp: `answer-${FakePC.all.indexOf(this)}` };
  }
  async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    this.candidates.push(c);
  }
  close() {
    this.closed = true;
  }
}

const track = { kind: 'audio' };
const stream = { getTracks: () => [track] } as unknown as MediaStream;

let sent: CallSignal[];
let onState: ReturnType<typeof vi.fn<(state: RTCPeerConnectionState) => void>>;
let onRemote: ReturnType<typeof vi.fn<(stream: MediaStream) => void>>;
const make = () =>
  new CallPeer({
    iceServers: [{ urls: ['turn:t'], username: 'u', credential: 'c' }],
    localStream: stream,
    send: (s) => sent.push(s),
    onRemoteStream: onRemote,
    onConnectionState: onState,
    createConnection: (config) => new FakePC(config) as unknown as RTCPeerConnection,
  });

beforeEach(() => {
  FakePC.all = [];
  sent = [];
  onState = vi.fn<(state: RTCPeerConnectionState) => void>();
  onRemote = vi.fn<(stream: MediaStream) => void>();
});

describe('CallPeer', () => {
  it('caller: offers through TURN only, with the local tracks', async () => {
    await make().offer();
    const [pc] = FakePC.all;
    expect(pc.config).toEqual({
      iceServers: [{ urls: ['turn:t'], username: 'u', credential: 'c' }],
      iceTransportPolicy: 'relay',
    });
    expect(pc.added).toEqual([track]);
    expect(sent).toEqual([{ type: 'offer', sid: expect.any(String), sdp: 'offer-0' }]);
  });

  it('callee: answers an offer with its sid; candidates that overtook it are kept for it', async () => {
    const peer = make();
    // Relayed before its offer; one of another (older) sid is dropped
    await peer.handle({ type: 'candidate', sid: 's0', candidate: { candidate: 'other' } });
    await peer.handle({ type: 'candidate', sid: 's1', candidate: { candidate: 'early' } });
    await peer.handle({ type: 'offer', sid: 's1', sdp: 'o' });
    await peer.handle({ type: 'candidate', sid: 's1', candidate: { candidate: 'late' } });
    const [pc] = FakePC.all;
    expect(pc.remoteDescription).toEqual({ type: 'offer', sdp: 'o' });
    expect(sent).toEqual([{ type: 'answer', sid: 's1', sdp: 'answer-0' }]);
    expect(pc.candidates).toEqual([{ candidate: 'early' }, { candidate: 'late' }]);
  });

  it('buffers candidates of the current sid until the answer arrives', async () => {
    const peer = make();
    await peer.offer();
    const sid = (sent[0] as { sid: string }).sid;
    await peer.handle({ type: 'candidate', sid, candidate: { candidate: 'c1' } });
    const [pc] = FakePC.all;
    expect(pc.candidates).toEqual([]);
    await peer.handle({ type: 'answer', sid, sdp: 'a' });
    expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'a' });
    expect(pc.candidates).toEqual([{ candidate: 'c1' }]);
  });

  it('a new offer replaces the connection; answers / candidates of the old one are dropped', async () => {
    const peer = make();
    await peer.offer();
    const oldSid = (sent[0] as { sid: string }).sid;
    await peer.offer();
    const [first, second] = FakePC.all;
    expect(first.closed).toBe(true);
    await peer.handle({ type: 'answer', sid: oldSid, sdp: 'stale' });
    await peer.handle({ type: 'candidate', sid: oldSid, candidate: { candidate: 'x' } });
    expect(second.remoteDescription).toBeNull();
    expect(second.candidates).toEqual([]);
  });

  it('sends its own candidates and reports state / remote media of the current connection only', async () => {
    const peer = make();
    await peer.offer();
    const [pc] = FakePC.all;
    pc.onicecandidate!({ candidate: { toJSON: () => ({ candidate: 'mine' }) } });
    pc.onicecandidate!({ candidate: null });
    expect(sent.slice(1)).toEqual([{ type: 'candidate', sid: (sent[0] as { sid: string }).sid, candidate: { candidate: 'mine' } }]);
    pc.connectionState = 'connected';
    pc.onconnectionstatechange!();
    expect(onState).toHaveBeenCalledWith('connected');
    const remote = { id: 'remote' };
    pc.ontrack!({ streams: [remote], track: {} });
    expect(onRemote).toHaveBeenCalledWith(remote);

    await peer.offer();
    pc.onconnectionstatechange!();
    expect(onState).toHaveBeenCalledTimes(1);
  });

  it('after close nothing is handled', async () => {
    const peer = make();
    peer.close();
    await peer.handle({ type: 'offer', sid: 's', sdp: 'o' });
    expect(FakePC.all).toHaveLength(0);
    expect(sent).toEqual([]);
  });
});
