'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { callService } from '@/services/api/call.service';
import { apiErrorText } from '@/lib/api-error';
import { CallPeer } from '@/lib/call-peer';
import { callStartedAt, describeCallEnd, mediaLabel } from '@/lib/call-format';
import { CallTone, startCallTone } from '@/lib/call-tones';
import { UserSettings } from '@/types/settings';
import {
  CallIceServer,
  CallIncomingEvent,
  CallInfo,
  CallMedia,
  CallPeerInfo,
  CallRole,
  CallSignal,
  CallUpdatedEvent,
} from '@/types/call';

// call:join again this often while the call lasts (the server's keys live 90 s)
export const CALL_HEARTBEAT_MS = 25_000;
// The ended screen stays this long
export const CALL_END_SCREEN_MS = 2_500;
// The caller re-negotiates at most this often after an ICE failure
const RESTART_GAP_MS = 3_000;

export type CallPhase =
  // Asking for the microphone / waiting for POST /call
  | 'preparing'
  // Caller: ringing at the other side
  | 'outgoing'
  // Callee: the call rings here
  | 'incoming'
  // Answered, media not flowing yet
  | 'connecting'
  | 'connected'
  // Socket or media connection lost, trying again
  | 'reconnecting'
  // A call of mine is going on (after a reload, or in another tab): "Tiếp tục ở đây"
  | 'resumable'
  | 'ended';

export interface CallView {
  phase: CallPhase;
  // null only while preparing
  call: CallInfo | null;
  conversationId: string;
  media: CallMedia;
  peer: CallPeerInfo;
  role: CallRole;
  micMuted: boolean;
  remoteMicMuted: boolean;
  // When the call timer starts (ms): the server's acceptedAt, capped at the local clock (display only)
  connectedAt: number | null;
  // Ended screen text or an error
  message: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

interface Session {
  call: CallInfo;
  role: CallRole;
  iceServers: CallIceServer[];
  stream: MediaStream;
  peer: CallPeer;
  heartbeat: ReturnType<typeof setInterval>;
  lastRestartAt: number;
}

type JoinAck =
  | { ok: true; data: { role: CallRole; state: 'ringing' | 'active'; peerJoined: boolean } }
  | { ok: false; error: { code: string; message: string } };

interface Options {
  enabled: boolean;
  currentUserId: string | null;
  settings: UserSettings;
  mutedConversationIds: Set<string>;
}

export const mediaErrorText = (err: unknown): string => {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Bạn chưa cho phép dùng micro';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Không tìm thấy micro';
  if (name === 'NotReadableError') return 'Micro đang được ứng dụng khác dùng';
  return 'Không mở được micro';
};

async function openMedia(media: CallMedia): Promise<MediaStream> {
  void media;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
}

const stopStream = (stream: MediaStream | null | undefined) => stream?.getTracks().forEach((t) => t.stop());

/**
 * 1-1 calls (message_logic.md §9). Mounted once (VeltraClientApp). REST starts / answers / ends
 * a call; the socket binds this tab to it (`call:join`, repeated as a heartbeat) and carries the
 * WebRTC signaling (`call:signal`). One call at a time; a second tab sees it as "resumable".
 */
export function useCall({ enabled, currentUserId, settings, mutedConversationIds }: Options) {
  const [view, setViewState] = useState<CallView | null>(null);
  const viewRef = useRef<CallView | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const toneRef = useRef<(() => void) | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationRef = useRef<Notification | null>(null);
  // An active call found at start (reload / other tab) with its ICE servers
  const resumeRef = useRef<CallIceServer[] | null>(null);
  // Hang-up pressed while POST /call is still on the way
  const abandonedRef = useRef(false);
  const latest = useRef({ currentUserId, settings, mutedConversationIds });
  useEffect(() => {
    latest.current = { currentUserId, settings, mutedConversationIds };
  });

  const setView = useCallback((next: CallView | null | ((prev: CallView | null) => CallView | null)) => {
    const value = typeof next === 'function' ? next(viewRef.current) : next;
    viewRef.current = value;
    setViewState(value);
  }, []);

  const patchView = useCallback(
    (patch: Partial<CallView>) => setView((prev) => (prev ? { ...prev, ...patch } : prev)),
    [setView]
  );

  const stopTone = useCallback(() => {
    toneRef.current?.();
    toneRef.current = null;
  }, []);

  const playTone = useCallback(
    (kind: CallTone, conversationId: string) => {
      stopTone();
      const { settings: s, mutedConversationIds: muted } = latest.current;
      // Ringback is always played to the caller; the ringtone follows sound / DND / mute
      if (kind === 'ring' && (!s.notifications.sound || s.notifications.doNotDisturb || muted.has(conversationId))) {
        return;
      }
      toneRef.current = startCallTone(kind);
    },
    [stopTone]
  );

  const closeNotification = useCallback(() => {
    notificationRef.current?.close();
    notificationRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      clearInterval(session.heartbeat);
      session.peer.close();
      stopStream(session.stream);
    }
    stopTone();
    closeNotification();
  }, [stopTone, closeNotification]);

  const clearEndTimer = () => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = null;
  };

  // Show the ended screen for a moment, then nothing
  const finish = useCallback(
    (message: string) => {
      teardown();
      resumeRef.current = null;
      setView((prev) =>
        prev ? { ...prev, phase: 'ended', message, localStream: null, remoteStream: null } : prev
      );
      clearEndTimer();
      endTimerRef.current = setTimeout(() => {
        endTimerRef.current = null;
        setView((prev) => (prev?.phase === 'ended' ? null : prev));
      }, CALL_END_SCREEN_MS);
    },
    [teardown, setView]
  );

  const sendSignal = useCallback((callId: string, data: CallSignal) => {
    void socketService.emitWithAck('call:signal', { callId, data });
  }, []);

  const sendState = useCallback(() => {
    const session = sessionRef.current;
    const v = viewRef.current;
    if (!session || !v) return;
    sendSignal(session.call.id, { type: 'state', micMuted: v.micMuted });
  }, [sendSignal]);

  // Caller: a new negotiation (the other side joined / re-joined, or ICE failed)
  const renegotiate = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.role !== 'caller') return;
    session.lastRestartAt = Date.now();
    void session.peer.offer().catch(() => undefined);
  }, []);

  // Binds this socket to the call. `fresh`: first join on this socket (not a heartbeat)
  const join = useCallback(
    async (fresh: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      const ack = await socketService.emitWithAck<JoinAck>('call:join', { callId: session.call.id });
      if (sessionRef.current !== session || !ack) return; // not connected: the connect handler joins again
      if (!ack.ok) {
        if (ack.error.code === 'NOT_FOUND') finish('Cuộc gọi đã kết thúc');
        return;
      }
      if (fresh && ack.data.peerJoined) {
        sendState();
        if (session.role === 'caller') renegotiate();
      }
    },
    [finish, renegotiate, sendState]
  );

  // From here on this tab carries the call
  const begin = useCallback(
    (call: CallInfo, role: CallRole, iceServers: CallIceServer[], stream: MediaStream) => {
      const peer = new CallPeer({
        iceServers,
        localStream: stream,
        send: (data) => sendSignal(call.id, data),
        onRemoteStream: (remoteStream) => patchView({ remoteStream }),
        onConnectionState: (state) => {
          if (state === 'connected') {
            stopTone();
            setView((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'connected',
                    connectedAt: prev.connectedAt ?? callStartedAt(prev.call?.acceptedAt, Date.now()),
                  }
                : prev
            );
          } else if (state === 'disconnected' || state === 'failed') {
            setView((prev) =>
              prev && (prev.phase === 'connected' || prev.phase === 'connecting')
                ? { ...prev, phase: 'reconnecting' }
                : prev
            );
            const session = sessionRef.current;
            if (state === 'failed' && session && Date.now() - session.lastRestartAt >= RESTART_GAP_MS) {
              renegotiate();
            }
          }
        },
      });
      const session: Session = {
        call,
        role,
        iceServers,
        stream,
        peer,
        heartbeat: setInterval(() => void join(false), CALL_HEARTBEAT_MS),
        lastRestartAt: 0,
      };
      sessionRef.current = session;
      void join(true);
    },
    [join, patchView, renegotiate, sendSignal, setView, stopTone]
  );

  const showIncoming = useCallback(
    (call: CallInfo, caller: CallPeerInfo) => {
      clearEndTimer();
      setView({
        phase: 'incoming',
        call,
        conversationId: call.conversationId,
        media: call.media,
        peer: caller,
        role: 'callee',
        micMuted: false,
        remoteMicMuted: false,
        connectedAt: null,
        message: null,
        localStream: null,
        remoteStream: null,
      });
      playTone('ring', call.conversationId);
      // System notification while the tab is hidden (same settings as messages)
      const { settings: s, mutedConversationIds: muted } = latest.current;
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        s.notifications.browser &&
        !s.notifications.doNotDisturb &&
        !muted.has(call.conversationId)
      ) {
        try {
          const name = caller.displayName || caller.username;
          const n = new Notification('Veltra', {
            body: `${mediaLabel(call.media)} đến từ ${name}`,
            tag: `call:${call.id}`,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
          notificationRef.current = n;
        } catch {
          // Some browsers only allow notifications from a service worker
        }
      }
    },
    [playTone, setView]
  );

  // Socket events
  useEffect(() => {
    if (!enabled) return;

    const onIncoming = (event: CallIncomingEvent) => {
      const current = viewRef.current;
      if (!event?.call || sessionRef.current || (current && current.phase !== 'ended')) return;
      showIncoming(event.call, event.caller);
    };

    const onUpdated = (event: CallUpdatedEvent) => {
      const call = event?.call;
      if (!call) return;
      const session = sessionRef.current;
      if (session && session.call.id === call.id) {
        if (call.state === 'ended') {
          finish(describeCallEnd(event.reason, session.role === 'caller'));
        } else if (call.state === 'active') {
          session.call = call;
          stopTone();
          setView((prev) => (prev && prev.phase === 'outgoing' ? { ...prev, call, phase: 'connecting' } : prev));
        }
        return;
      }
      const current = viewRef.current;
      if (!current || current.call?.id !== call.id || session) return;
      if (current.phase === 'incoming') {
        if (call.state === 'ended') {
          finish(describeCallEnd(event.reason, false));
        } else if (call.state === 'active') {
          // Answered in another tab of mine: that tab carries it
          stopTone();
          closeNotification();
          resumeRef.current = null;
          setView({ ...current, call, phase: 'resumable' });
        }
      } else if (call.state === 'ended' && current.phase !== 'ended') {
        // Resumable here, or a screen left without its connection: the call is over
        finish(describeCallEnd(event.reason, current.role === 'caller'));
      }
    };

    const onPeerJoined = (event: { callId?: string }) => {
      const session = sessionRef.current;
      if (!session || event?.callId !== session.call.id) return;
      sendState();
      if (session.role === 'caller') renegotiate();
    };

    const onSignal = (event: { callId?: string; data?: CallSignal }) => {
      const session = sessionRef.current;
      const data = event?.data;
      if (!session || event?.callId !== session.call.id || !data || typeof data !== 'object') return;
      if (data.type === 'state') {
        patchView({ remoteMicMuted: !!data.micMuted });
        return;
      }
      void session.peer.handle(data).catch(() => undefined);
    };

    // Another tab of mine took the call over
    const onMoved = (event: { callId?: string }) => {
      const session = sessionRef.current;
      if (!session || event?.callId !== session.call.id) return;
      finish('Cuộc gọi đã chuyển sang thiết bị khác');
    };

    const onConnect = () => {
      if (sessionRef.current) void join(true);
    };
    const onDisconnect = () => {
      if (sessionRef.current) {
        setView((prev) =>
          prev && (prev.phase === 'connected' || prev.phase === 'connecting') ? { ...prev, phase: 'reconnecting' } : prev
        );
      }
    };

    socketService.on('call:incoming', onIncoming);
    socketService.on('call:updated', onUpdated);
    socketService.on('call:peer-joined', onPeerJoined);
    socketService.on('call:signal', onSignal);
    socketService.on('call:moved', onMoved);
    socketService.on('connect', onConnect);
    socketService.on('disconnect', onDisconnect);
    return () => {
      socketService.off('call:incoming', onIncoming);
      socketService.off('call:updated', onUpdated);
      socketService.off('call:peer-joined', onPeerJoined);
      socketService.off('call:signal', onSignal);
      socketService.off('call:moved', onMoved);
      socketService.off('connect', onConnect);
      socketService.off('disconnect', onDisconnect);
    };
  }, [enabled, closeNotification, finish, join, patchView, renegotiate, sendState, setView, showIncoming, stopTone]);

  // At start: a call of mine already going on (reload, another tab)
  useEffect(() => {
    if (!enabled || !currentUserId) return;
    let cancelled = false;
    callService
      .getActive()
      .then((res) => {
        if (cancelled || !res.call || sessionRef.current || viewRef.current) return;
        const role: CallRole = res.call.callerId === currentUserId ? 'caller' : 'callee';
        if (role === 'callee' && res.call.state === 'ringing') {
          showIncoming(res.call, res.peer);
          return;
        }
        resumeRef.current = res.iceServers ?? null;
        setView({
          phase: 'resumable',
          call: res.call,
          conversationId: res.call.conversationId,
          media: res.call.media,
          peer: res.peer,
          role,
          micMuted: false,
          remoteMicMuted: false,
          connectedAt: null,
          message: null,
          localStream: null,
          remoteStream: null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, currentUserId, setView, showIncoming]);

  // Signed out / unmounted: drop everything (the server ends the call after its grace window)
  useEffect(() => {
    if (enabled) return;
    teardown();
    clearEndTimer();
    setView(null);
  }, [enabled, teardown, setView]);
  useEffect(
    () => () => {
      teardown();
      clearEndTimer();
    },
    [teardown]
  );

  const startCall = useCallback(
    async (conversationId: string, peer: CallPeerInfo, media: CallMedia) => {
      const current = viewRef.current;
      if (sessionRef.current || (current && current.phase !== 'ended')) return;
      clearEndTimer();
      abandonedRef.current = false;
      setView({
        phase: 'preparing',
        call: null,
        conversationId,
        media,
        peer,
        role: 'caller',
        micMuted: false,
        remoteMicMuted: false,
        connectedAt: null,
        message: null,
        localStream: null,
        remoteStream: null,
      });
      let stream: MediaStream;
      try {
        stream = await openMedia(media);
      } catch (err: unknown) {
        finish(mediaErrorText(err));
        return;
      }
      if (abandonedRef.current) {
        stopStream(stream);
        return;
      }
      try {
        const { call, iceServers } = await callService.start(conversationId, media);
        if (abandonedRef.current) {
          stopStream(stream);
          void callService.end(call.id).catch(() => undefined);
          return;
        }
        // The call may have been answered (call:updated) before this response arrived
        setView((prev) =>
          prev ? { ...prev, call, phase: call.state === 'active' ? 'connecting' : 'outgoing', localStream: stream } : prev
        );
        if (call.state === 'ringing') playTone('ringback', conversationId);
        begin(call, 'caller', iceServers, stream);
      } catch (err: unknown) {
        stopStream(stream);
        if (!abandonedRef.current) finish(apiErrorText(err, 'Không thể bắt đầu cuộc gọi'));
      }
    },
    [begin, finish, playTone, setView]
  );

  const accept = useCallback(async () => {
    const current = viewRef.current;
    if (!current?.call || current.phase !== 'incoming') return;
    const call = current.call;
    stopTone();
    closeNotification();
    setView({ ...current, phase: 'connecting' });
    let stream: MediaStream;
    try {
      stream = await openMedia(call.media);
    } catch (err: unknown) {
      // Without a microphone the call cannot be taken: decline it so the caller is told
      void callService.decline(call.id).catch(() => undefined);
      finish(mediaErrorText(err));
      return;
    }
    try {
      const res = await callService.accept(call.id);
      if (viewRef.current?.call?.id !== call.id || viewRef.current.phase === 'ended') {
        stopStream(stream);
        return;
      }
      patchView({ call: res.call, localStream: stream });
      begin(res.call, 'callee', res.iceServers, stream);
    } catch (err: unknown) {
      stopStream(stream);
      finish(apiErrorText(err, 'Không thể trả lời cuộc gọi'));
    }
  }, [begin, closeNotification, finish, patchView, setView, stopTone]);

  const decline = useCallback(() => {
    const current = viewRef.current;
    if (!current?.call || current.phase !== 'incoming') return;
    void callService.decline(current.call.id).catch(() => undefined);
    finish('Đã từ chối');
  }, [finish]);

  // Hang up / cancel / leave the ended screen
  const hangUp = useCallback(() => {
    const current = viewRef.current;
    if (!current) return;
    if (current.phase === 'ended') {
      clearEndTimer();
      setView(null);
      return;
    }
    if (current.phase === 'incoming') {
      decline();
      return;
    }
    if (current.phase === 'preparing' && !current.call) {
      abandonedRef.current = true;
      finish('Đã hủy cuộc gọi');
      return;
    }
    if (current.call) void callService.end(current.call.id).catch(() => undefined);
    finish(current.phase === 'outgoing' ? 'Đã hủy cuộc gọi' : 'Cuộc gọi đã kết thúc');
  }, [decline, finish, setView]);

  // "Tiếp tục ở đây": take an ongoing call of mine over in this tab
  const resume = useCallback(async () => {
    const current = viewRef.current;
    if (!current?.call || current.phase !== 'resumable') return;
    const call = current.call;
    setView({ ...current, phase: 'connecting' });
    let iceServers = resumeRef.current;
    let stream: MediaStream;
    try {
      stream = await openMedia(call.media);
    } catch (err: unknown) {
      setView({ ...current, message: mediaErrorText(err) });
      return;
    }
    try {
      if (!iceServers) {
        const res = await callService.getActive();
        if (!res.call || res.call.id !== call.id) throw new Error('gone');
        iceServers = res.iceServers ?? null;
      }
      if (!iceServers) throw new Error('no ice');
    } catch {
      stopStream(stream);
      setView({ ...current, message: 'Không thể kết nối lại, hãy thử lại' });
      return;
    }
    resumeRef.current = null;
    patchView({
      localStream: stream,
      phase: call.state === 'ringing' ? 'outgoing' : 'connecting',
      message: null,
    });
    begin(call, current.role, iceServers, stream);
  }, [begin, patchView, setView]);

  const toggleMic = useCallback(() => {
    const session = sessionRef.current;
    const current = viewRef.current;
    if (!session || !current) return;
    const micMuted = !current.micMuted;
    session.stream.getAudioTracks().forEach((t) => (t.enabled = !micMuted));
    patchView({ micMuted });
    sendState();
  }, [patchView, sendState]);

  return {
    view,
    // A call of mine is on screen (start buttons are disabled)
    busy: !!view && view.phase !== 'ended',
    startCall,
    accept,
    decline,
    hangUp,
    resume,
    toggleMic,
  };
}
