// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallInfo, CallPeerInfo } from '@/types/call';
import { DEFAULT_SETTINGS, UserSettings } from '@/types/settings';

const { handlers, emitWithAck, api, peers, startCallTone, stopTone } = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => void>(),
  emitWithAck: vi.fn(),
  api: {
    start: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    end: vi.fn(),
    getActive: vi.fn(),
  },
  peers: [] as {
    options: { onConnectionState: (s: string) => void; onRemoteStream: (s: unknown) => void; send: (d: unknown) => void };
    offer: ReturnType<typeof vi.fn>;
    handle: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[],
  startCallTone: vi.fn(),
  stopTone: vi.fn(),
}));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    on: (event: string, handler: (payload?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    emitWithAck,
  },
}));
vi.mock('@/services/api/call.service', () => ({ callService: api }));
vi.mock('@/lib/call-tones', () => ({ startCallTone }));
vi.mock('@/lib/call-peer', () => ({
  CallPeer: class {
    offer = vi.fn(() => Promise.resolve());
    handle = vi.fn(() => Promise.resolve());
    close = vi.fn();
    constructor(public options: (typeof peers)[number]['options']) {
      peers.push(this as unknown as (typeof peers)[number]);
    }
  },
}));

import { CALL_END_SCREEN_MS, CALL_HEARTBEAT_MS, useCall } from '@/hooks/use-call';

const ICE = [{ urls: ['turn:t'] }];
const partner: CallPeerInfo = { _id: 'bob', username: 'bob', displayName: 'Bình' };
const call = (over: Partial<CallInfo> = {}): CallInfo => ({
  id: 'call-1',
  conversationId: 'c1',
  callerId: 'me',
  calleeId: 'bob',
  media: 'audio',
  state: 'ringing',
  createdAt: '2026-11-28T00:00:00.000Z',
  ...over,
});
const incoming = (over: Partial<CallInfo> = {}) => call({ callerId: 'bob', calleeId: 'me', ...over });

let track: { stop: ReturnType<typeof vi.fn>; enabled: boolean };
let getUserMedia: ReturnType<typeof vi.fn>;
const emit = (event: string, payload?: unknown) => act(() => handlers.get(event)!(payload));
const joinAck = (peerJoined = false) => ({ ok: true, data: { role: 'caller', state: 'ringing', peerJoined } });
const joins = () => emitWithAck.mock.calls.filter(([e]) => e === 'call:join');
const signals = () => emitWithAck.mock.calls.filter(([e]) => e === 'call:signal').map(([, p]) => p);

const render = (settings: UserSettings = DEFAULT_SETTINGS, muted = new Set<string>()) =>
  renderHook(() => useCall({ enabled: true, currentUserId: 'me', settings, mutedConversationIds: muted }));

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  peers.length = 0;
  track = { stop: vi.fn(), enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  api.getActive.mockResolvedValue({ call: null });
  api.end.mockResolvedValue(undefined);
  api.decline.mockResolvedValue(undefined);
  emitWithAck.mockResolvedValue(joinAck());
  startCallTone.mockReturnValue(stopTone);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCall: outgoing', () => {
  it('opens the mic, starts the call, rings back, joins; then connected and ended by the server', async () => {
    api.start.mockResolvedValue({ call: call(), iceServers: ICE });
    const { result } = render();
    await act(() => result.current.startCall('c1', partner, 'audio'));

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
    expect(api.start).toHaveBeenCalledWith('c1', 'audio');
    expect(result.current.view).toMatchObject({ phase: 'outgoing', role: 'caller', peer: partner });
    expect(result.current.busy).toBe(true);
    expect(startCallTone).toHaveBeenCalledWith('ringback');
    expect(joins()).toEqual([['call:join', { callId: 'call-1' }]]);

    emit('call:updated', { call: call({ state: 'active' }) });
    expect(result.current.view?.phase).toBe('connecting');
    expect(stopTone).toHaveBeenCalled();
    // The callee joined: the caller negotiates and tells its mic state
    emit('call:peer-joined', { callId: 'call-1', role: 'callee' });
    expect(peers[0].offer).toHaveBeenCalledTimes(1);
    expect(signals()).toContainEqual({ callId: 'call-1', data: { type: 'state', micMuted: false } });
    act(() => peers[0].options.onConnectionState('connected'));
    expect(result.current.view).toMatchObject({ phase: 'connected', connectedAt: expect.any(Number) });

    vi.useFakeTimers();
    emit('call:updated', { call: call({ state: 'ended' }), reason: 'ended', durationSec: 5 });
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Cuộc gọi đã kết thúc' });
    expect(track.stop).toHaveBeenCalled();
    expect(peers[0].close).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CALL_END_SCREEN_MS));
    expect(result.current.view).toBeNull();
  });

  it('mic refused: nothing is started', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const { result } = render();
    await act(() => result.current.startCall('c1', partner, 'audio'));
    expect(api.start).not.toHaveBeenCalled();
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Bạn chưa cho phép dùng micro' });
  });

  it('refused by the server (busy): its message, the mic released', async () => {
    api.start.mockRejectedValue({ response: { status: 409, data: { message: 'Người nhận đang bận' } } });
    const { result } = render();
    await act(() => result.current.startCall('c1', partner, 'audio'));
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Người nhận đang bận' });
    expect(track.stop).toHaveBeenCalled();
    expect(joins()).toEqual([]);
  });

  it('hang up while POST /call is on the way: the call is ended as soon as it exists', async () => {
    let answer!: (v: unknown) => void;
    api.start.mockReturnValue(new Promise((r) => (answer = r)));
    const { result } = render();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.startCall('c1', partner, 'audio');
    });
    await waitFor(() => expect(api.start).toHaveBeenCalled());
    act(() => result.current.hangUp());
    expect(result.current.view?.phase).toBe('ended');
    await act(async () => {
      answer({ call: call(), iceServers: ICE });
      await pending;
    });
    expect(api.end).toHaveBeenCalledWith('call-1');
    expect(track.stop).toHaveBeenCalled();
    expect(joins()).toEqual([]);
  });

  it('cancel while ringing: POST end, the screen says so', async () => {
    api.start.mockResolvedValue({ call: call(), iceServers: ICE });
    const { result } = render();
    await act(() => result.current.startCall('c1', partner, 'audio'));
    act(() => result.current.hangUp());
    expect(api.end).toHaveBeenCalledWith('call-1');
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Đã hủy cuộc gọi' });
  });

  it('no second call while one is on screen', async () => {
    api.start.mockResolvedValue({ call: call(), iceServers: ICE });
    const { result } = render();
    await act(() => result.current.startCall('c1', partner, 'audio'));
    await act(() => result.current.startCall('c2', partner, 'audio'));
    expect(api.start).toHaveBeenCalledTimes(1);
  });
});

describe('useCall: incoming', () => {
  it('rings, accept opens the mic and joins; the callee waits for the offer', async () => {
    api.accept.mockResolvedValue({ call: incoming({ state: 'active' }), iceServers: ICE });
    emitWithAck.mockResolvedValue({ ok: true, data: { role: 'callee', state: 'active', peerJoined: true } });
    const { result } = render();
    emit('call:incoming', { call: incoming(), caller: partner });
    expect(result.current.view).toMatchObject({ phase: 'incoming', role: 'callee' });
    expect(startCallTone).toHaveBeenCalledWith('ring');

    await act(() => result.current.accept());
    expect(api.accept).toHaveBeenCalledWith('call-1');
    expect(result.current.view?.phase).toBe('connecting');
    await waitFor(() => expect(joins()).toHaveLength(1));
    expect(peers[0].offer).not.toHaveBeenCalled();

    emit('call:signal', { callId: 'call-1', data: { type: 'offer', sid: 's', sdp: 'o' } });
    expect(peers[0].handle).toHaveBeenCalledWith({ type: 'offer', sid: 's', sdp: 'o' });
    emit('call:signal', { callId: 'call-1', data: { type: 'state', micMuted: true } });
    expect(result.current.view?.remoteMicMuted).toBe(true);
    // Signals of another call are ignored
    emit('call:signal', { callId: 'other', data: { type: 'offer', sid: 'x', sdp: 'o' } });
    expect(peers[0].handle).toHaveBeenCalledTimes(1);
  });

  it('no ringtone with Do Not Disturb or a muted conversation', () => {
    const dnd = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, doNotDisturb: true } };
    const first = render(dnd);
    emit('call:incoming', { call: incoming(), caller: partner });
    expect(first.result.current.view?.phase).toBe('incoming');
    first.unmount();
    handlers.clear();
    render(DEFAULT_SETTINGS, new Set(['c1']));
    emit('call:incoming', { call: incoming(), caller: partner });
    expect(startCallTone).not.toHaveBeenCalled();
  });

  it('decline: POST decline and the ended note', () => {
    const { result } = render();
    emit('call:incoming', { call: incoming(), caller: partner });
    act(() => result.current.decline());
    expect(api.decline).toHaveBeenCalledWith('call-1');
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Đã từ chối' });
    expect(stopTone).toHaveBeenCalled();
  });

  it('answered in another tab: this tab only offers to take it over; canceled: missed-call note', () => {
    const { result } = render();
    emit('call:incoming', { call: incoming(), caller: partner });
    emit('call:updated', { call: incoming({ state: 'active' }) });
    expect(result.current.view?.phase).toBe('resumable');

    emit('call:updated', { call: incoming({ state: 'ended' }), reason: 'ended' });
    expect(result.current.view).toMatchObject({ phase: 'ended' });
  });

  it('the caller hangs up while it rings here', () => {
    const { result } = render();
    emit('call:incoming', { call: incoming(), caller: partner });
    emit('call:updated', { call: incoming({ state: 'ended' }), reason: 'canceled' });
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Người gọi đã hủy' });
  });

  it('accept with no microphone declines the call', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotFoundError' }));
    const { result } = render();
    emit('call:incoming', { call: incoming(), caller: partner });
    await act(() => result.current.accept());
    expect(api.accept).not.toHaveBeenCalled();
    expect(api.decline).toHaveBeenCalledWith('call-1');
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Không tìm thấy micro' });
  });
});

describe('useCall: staying in the call', () => {
  const inCall = async () => {
    api.start.mockResolvedValue({ call: call(), iceServers: ICE });
    const hook = render();
    await act(() => hook.result.current.startCall('c1', partner, 'audio'));
    return hook;
  };

  it('heartbeat joins do not renegotiate; a reconnect does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await inCall();
    emitWithAck.mockResolvedValue(joinAck(true));
    await act(() => vi.advanceTimersByTimeAsync(CALL_HEARTBEAT_MS));
    expect(joins()).toHaveLength(2);
    expect(peers[0].offer).not.toHaveBeenCalled();

    emit('disconnect');
    act(() => peers[0].options.onConnectionState('connected'));
    emit('disconnect');
    expect(result.current.view?.phase).toBe('reconnecting');
    await act(async () => handlers.get('connect')!());
    expect(joins()).toHaveLength(3);
    expect(peers[0].offer).toHaveBeenCalledTimes(1);
  });

  it('the call is gone on the server: ended', async () => {
    const { result } = await inCall();
    emitWithAck.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } });
    await act(async () => handlers.get('connect')!());
    expect(result.current.view).toMatchObject({ phase: 'ended', message: 'Cuộc gọi đã kết thúc' });
  });

  it('another tab took the call over', async () => {
    const { result } = await inCall();
    emit('call:moved', { callId: 'call-1' });
    expect(result.current.view?.message).toBe('Cuộc gọi đã chuyển sang thiết bị khác');
    expect(peers[0].close).toHaveBeenCalled();
  });

  it('mic toggle mutes the track and tells the other side', async () => {
    const { result } = await inCall();
    act(() => result.current.toggleMic());
    expect(track.enabled).toBe(false);
    expect(result.current.view?.micMuted).toBe(true);
    expect(signals()).toContainEqual({ callId: 'call-1', data: { type: 'state', micMuted: true } });
  });

  it('ICE failure: the caller negotiates again', async () => {
    const { result } = await inCall();
    act(() => peers[0].options.onConnectionState('connected'));
    act(() => peers[0].options.onConnectionState('failed'));
    expect(result.current.view?.phase).toBe('reconnecting');
    expect(peers[0].offer).toHaveBeenCalledTimes(1);
  });
});

describe('useCall: at start', () => {
  it('a call ringing for me shows as incoming', async () => {
    api.getActive.mockResolvedValue({ call: incoming(), peer: partner });
    const { result } = render();
    await waitFor(() => expect(result.current.view?.phase).toBe('incoming'));
  });

  it('an active call of mine is resumable; "Tiếp tục ở đây" joins it with fresh media', async () => {
    api.getActive.mockResolvedValue({
      call: call({ state: 'active', acceptedAt: '2026-11-28T00:00:05.000Z' }),
      peer: partner,
      iceServers: ICE,
    });
    emitWithAck.mockResolvedValue(joinAck(true));
    const { result } = render();
    await waitFor(() => expect(result.current.view?.phase).toBe('resumable'));
    expect(joins()).toEqual([]);

    await act(() => result.current.resume());
    expect(getUserMedia).toHaveBeenCalled();
    await waitFor(() => expect(joins()).toHaveLength(1));
    expect(result.current.view?.phase).toBe('connecting');
    // I am the caller and the callee is there: new negotiation
    expect(peers[0].offer).toHaveBeenCalled();
    // The timer goes on from when the call was answered, not from this tab's reconnect
    act(() => peers[0].options.onConnectionState('connected'));
    expect(result.current.view?.connectedAt).toBe(Date.parse('2026-11-28T00:00:05.000Z'));
  });
});
