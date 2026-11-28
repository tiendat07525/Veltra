import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { Model, Types } from 'mongoose';
import { errorMessage } from '../common/error-message';
import {
  Conversation,
  ConversationDocument,
} from '../conversation/schemas/conversation.schema';
import { Friend, FriendDocument } from '../friend/schema/friend.schema';
import { MessageService } from '../messages/message.service';
import type {
  CallRecord,
  CallRecordStatus,
} from '../messages/schemas/message.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { UsersService } from '../users/users.service';
import {
  CALL_KEY_TTL_S,
  REJOIN_GRACE_MS,
  RING_TIMEOUT_MS,
} from './call.constants';
import type { CallEndReason, CallRole, CallState } from './call.constants';
import { CallStateService } from './call-state.service';
import type { StoredCall } from './call-state.service';
import { StartCallDto } from './dto/start-call.dto';
import { TurnService } from './turn.service';
import type { IceServer } from './turn.service';

const NOT_FOUND = 'Không tìm thấy cuộc gọi';

// What clients receive for a call (REST responses, call:incoming, call:updated)
export function toCallPayload(call: StoredCall) {
  return {
    id: call.id,
    conversationId: call.conversationId,
    callerId: call.callerId,
    calleeId: call.calleeId,
    media: call.media,
    state: call.state,
    createdAt: call.createdAt,
    ...(call.acceptedAt ? { acceptedAt: call.acceptedAt } : {}),
  };
}

export type CallPayload = ReturnType<typeof toCallPayload>;

// How a finished call is stored as a message
const RECORD_STATUS: Record<CallEndReason, CallRecordStatus> = {
  ended: 'completed',
  dropped: 'completed',
  canceled: 'missed',
  missed: 'missed',
  busy: 'missed',
  declined: 'declined',
};

// m:ss, or h:mm:ss from one hour
export function formatCallDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// The text of a call message (shown in the conversation list and by old clients)
export function callRecordText(record: CallRecord): string {
  if (record.status === 'missed') return 'Cuộc gọi nhỡ';
  if (record.status === 'declined') return 'Cuộc gọi bị từ chối';
  const label = record.media === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  return `${label} · ${formatCallDuration(record.durationSec ?? 0)}`;
}

/**
 * 1-1 calls (message_logic.md §9, realtime.md §4 Calls). State lives only in Redis (CallStateService); a finished call is
 * stored once as a message of the caller. Ring and rejoin timers are local to this instance:
 * every finish is conditional, so a timer on another instance (or a late one) never ends the
 * wrong call, and the call keys expire after CALL_KEY_TTL_S if no instance is left to end it.
 */
@Injectable()
export class CallService implements OnModuleDestroy {
  private readonly logger = new Logger(CallService.name);
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();
  // `${callId}:${socketId}` → timer that ends the call if that socket does not come back
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Friend.name)
    private readonly friendModel: Model<FriendDocument>,
    private readonly callState: CallStateService,
    private readonly turn: TurnService,
    private readonly realtime: RealtimeService,
    private readonly messageService: MessageService,
    private readonly usersService: UsersService,
  ) {}

  onModuleDestroy() {
    for (const timer of [
      ...this.ringTimers.values(),
      ...this.graceTimers.values(),
    ]) {
      clearTimeout(timer);
    }
    this.ringTimers.clear();
    this.graceTimers.clear();
  }

  async start(
    userId: string,
    dto: StartCallDto,
  ): Promise<{ call: CallPayload; iceServers: IceServer[] }> {
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(dto.conversationId),
        'participants.userId': new Types.ObjectId(userId),
      })
      .lean();
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }
    const calleeId = conversation.participants
      .map((p) => p.userId.toString())
      .find((id) => id !== userId);
    if (conversation.type !== 'direct' || !calleeId) {
      throw new BadRequestException('Chỉ gọi được trong cuộc trò chuyện 1-1');
    }
    // Friend rows are stored with user < friend
    const [a, b] = [userId, calleeId].sort();
    const friends = await this.friendModel.exists({
      user: new Types.ObjectId(a),
      friend: new Types.ObjectId(b),
    });
    if (!friends) {
      throw new ForbiddenException('Chỉ gọi được cho bạn bè');
    }

    // Before any state: without TURN there is no call
    const iceServers = await this.turn.iceServers();

    const call: StoredCall = {
      id: randomUUID(),
      conversationId: conversation._id.toString(),
      callerId: userId,
      calleeId,
      media: dto.media,
      state: 'ringing',
      createdAt: new Date().toISOString(),
    };
    const result = await this.callState.start(call, CALL_KEY_TTL_S);
    if (result === 'CALLER_BUSY') {
      throw new ConflictException('Bạn đang trong một cuộc gọi khác');
    }
    if (result === 'CALLEE_BUSY') {
      // The callee sees a missed call; the caller gets "busy"
      await this.record(call, 'busy');
      throw new ConflictException('Người nhận đang bận');
    }

    const payload = toCallPayload(call);
    const caller = await this.publicProfile(userId);
    this.realtime.emitToUser(calleeId, 'call:incoming', {
      call: payload,
      caller,
    });
    // The caller's other tabs
    this.realtime.emitToUser(userId, 'call:updated', { call: payload });

    const timer = setTimeout(() => {
      this.ringTimers.delete(call.id);
      void this.finishIf(call, { state: 'ringing' }, 'missed');
    }, RING_TIMEOUT_MS);
    timer.unref?.();
    this.ringTimers.set(call.id, timer);

    return { call: payload, iceServers };
  }

  async accept(
    userId: string,
    callId: string,
  ): Promise<{ call: CallPayload; iceServers: IceServer[] }> {
    const call = await this.findCall(callId, userId);
    if (call.calleeId !== userId) throw new NotFoundException(NOT_FOUND);
    if (call.state !== 'ringing') {
      throw new ConflictException('Cuộc gọi đã được trả lời');
    }
    // Before accepting: a callee without TURN must not leave an answered call behind
    const iceServers = await this.turn.iceServers();

    const acceptedAt = new Date().toISOString();
    const result = await this.callState.accept(
      call,
      userId,
      acceptedAt,
      CALL_KEY_TTL_S,
    );
    if (result === 'NOT_FOUND') throw new NotFoundException(NOT_FOUND);
    if (result === 'CONFLICT') {
      throw new ConflictException('Cuộc gọi đã được trả lời');
    }
    this.clearRing(call.id);

    const payload = toCallPayload({ ...call, state: 'active', acceptedAt });
    // Both parties, every tab: the callee's other tabs stop ringing
    for (const id of [call.callerId, call.calleeId]) {
      this.realtime.emitToUser(id, 'call:updated', { call: payload });
    }
    return { call: payload, iceServers };
  }

  async decline(userId: string, callId: string): Promise<{ ok: true }> {
    const call = await this.findCall(callId, userId);
    if (call.calleeId !== userId) throw new NotFoundException(NOT_FOUND);
    const finished = await this.finishIf(
      call,
      { state: 'ringing' },
      'declined',
    );
    if (!finished) {
      throw new ConflictException('Cuộc gọi đã được trả lời hoặc đã kết thúc');
    }
    return { ok: true };
  }

  // Hang up / cancel. Ending a call that is already over is not an error.
  async end(userId: string, callId: string): Promise<{ ok: true }> {
    let call: StoredCall | null = await this.findCall(callId, userId);
    // A ringing call may be accepted meanwhile: then end it as an active call
    for (let attempt = 0; attempt < 2 && call; attempt++) {
      const reason: CallEndReason =
        call.state === 'active'
          ? 'ended'
          : call.callerId === userId
            ? 'canceled'
            : 'declined';
      if (await this.finishIf(call, { state: call.state }, reason)) break;
      call = await this.callState.get(call.id);
    }
    return { ok: true };
  }

  // The user's current call (after a reload), with what is needed to take it up again
  async getActive(userId: string) {
    const call = await this.callState.activeFor(userId);
    if (!call) return { call: null };
    const peerId = call.callerId === userId ? call.calleeId : call.callerId;
    const peer = await this.publicProfile(peerId);
    const canJoin = call.callerId === userId || call.state === 'active';
    let iceServers: IceServer[] | undefined;
    if (canJoin) {
      try {
        iceServers = await this.turn.iceServers();
      } catch (err: unknown) {
        this.logger.warn(`[Call] TURN khi lấy cuộc gọi: ${errorMessage(err)}`);
      }
    }
    return {
      call: toCallPayload(call),
      peer,
      ...(iceServers ? { iceServers } : {}),
    };
  }

  /**
   * call:join from a socket: binds it to the call (signals go between bound sockets) and renews
   * the keys. Re-joining after a reconnect replaces the old socket and stops its grace timer.
   */
  async join(userId: string, callId: string, socketId: string) {
    if (!isUUID(callId)) return { ok: false as const, code: 'NOT_FOUND' };
    const call = await this.callState.get(callId);
    if (!call) return { ok: false as const, code: 'NOT_FOUND' };
    const result = await this.callState.join(
      call,
      userId,
      socketId,
      CALL_KEY_TTL_S,
    );
    if (!result.ok) return result;
    if (result.previousSocket) {
      this.clearGrace(callId, result.previousSocket);
    }
    // A heartbeat (same socket again) changes nothing for anyone
    const newSocket = result.previousSocket !== socketId;
    if (newSocket && result.previousSocket) {
      // That tab (if it is still open) no longer carries the call
      this.realtime.emitToSocket(result.previousSocket, 'call:moved', {
        callId,
      });
    }
    if (newSocket && result.peerSocket) {
      // The other side negotiates (again) with this socket
      this.realtime.emitToSocket(result.peerSocket, 'call:peer-joined', {
        callId,
        role: result.role,
      });
    }
    return result;
  }

  // The peer's bound socket for a signal from `socketId`, or why there is none
  async signalTarget(
    callId: string,
    role: CallRole,
    socketId: string,
  ): Promise<{ ok: true; peerSocket: string } | { ok: false; code: string }> {
    const call = await this.callState.get(callId);
    if (!call) return { ok: false, code: 'NOT_FOUND' };
    const mine = role === 'caller' ? call.callerSocket : call.calleeSocket;
    // Another socket of the same user joined since: this one is out of the call
    if (mine !== socketId) return { ok: false, code: 'NOT_JOINED' };
    const peer = role === 'caller' ? call.calleeSocket : call.callerSocket;
    if (!peer) return { ok: false, code: 'PEER_NOT_JOINED' };
    return { ok: true, peerSocket: peer };
  }

  // A bound socket disconnected: end the call unless that party re-joins within the grace window
  socketLeft(callId: string, role: CallRole, socketId: string) {
    const key = `${callId}:${socketId}`;
    if (this.graceTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.graceTimers.delete(key);
      void this.finishDropped(callId, role, socketId);
    }, REJOIN_GRACE_MS);
    timer.unref?.();
    this.graceTimers.set(key, timer);
  }

  private async finishDropped(
    callId: string,
    role: CallRole,
    socketId: string,
  ) {
    try {
      const call = await this.callState.get(callId);
      if (!call) return;
      const finished = await this.callState.finish(call, {
        socket: { role, id: socketId },
      });
      if (finished) {
        // A caller gone before the answer canceled it
        await this.onFinished(
          finished,
          finished.state === 'active' ? 'dropped' : 'canceled',
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `[Call] kết thúc khi mất kết nối: ${errorMessage(err)}`,
      );
    }
  }

  // Ends the call if it is still in `state`; the stored call when this request ended it
  private async finishIf(
    call: StoredCall,
    when: { state: CallState },
    reason: CallEndReason,
  ): Promise<StoredCall | null> {
    try {
      const finished = await this.callState.finish(call, when);
      if (finished) await this.onFinished(finished, reason);
      return finished;
    } catch (err: unknown) {
      this.logger.error(`[Call] kết thúc cuộc gọi: ${errorMessage(err)}`);
      throw err;
    }
  }

  private async onFinished(call: StoredCall, reason: CallEndReason) {
    this.clearRing(call.id);
    for (const key of [...this.graceTimers.keys()]) {
      if (key.startsWith(`${call.id}:`))
        this.clearGrace(call.id, key.slice(call.id.length + 1));
    }
    const durationSec = this.durationOf(call, reason);
    const ended = {
      call: { ...toCallPayload(call), state: 'ended' as const },
      reason,
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
    for (const id of [call.callerId, call.calleeId]) {
      this.realtime.emitToUser(id, 'call:updated', ended);
    }
    await this.record(call, reason);
  }

  // Stored once per call (clientMsgId = callId); a failure is logged, the call is over anyway
  private async record(call: StoredCall, reason: CallEndReason) {
    const durationSec = this.durationOf(call, reason);
    const record: CallRecord = {
      media: call.media,
      status: RECORD_STATUS[reason],
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
    try {
      await this.messageService.recordCall(
        call.conversationId,
        call.callerId,
        call.id,
        record,
        callRecordText(record),
      );
    } catch (err: unknown) {
      this.logger.error(
        `[Call] không lưu được tin cuộc gọi: ${errorMessage(err)}`,
      );
    }
  }

  private durationOf(call: StoredCall, reason: CallEndReason) {
    if (RECORD_STATUS[reason] !== 'completed' || !call.acceptedAt) {
      return undefined;
    }
    return Math.max(
      0,
      Math.floor((Date.now() - Date.parse(call.acceptedAt)) / 1000),
    );
  }

  // The call, if the user is one of its parties (otherwise 404: never reveal other calls)
  private async findCall(callId: string, userId: string) {
    if (!isUUID(callId)) throw new NotFoundException(NOT_FOUND);
    const call = await this.callState.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      throw new NotFoundException(NOT_FOUND);
    }
    return call;
  }

  private async publicProfile(userId: string) {
    const user = await this.usersService.findPublicProfile(userId);
    return {
      _id: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  private clearRing(callId: string) {
    const timer = this.ringTimers.get(callId);
    if (timer) clearTimeout(timer);
    this.ringTimers.delete(callId);
  }

  private clearGrace(callId: string, socketId: string) {
    const key = `${callId}:${socketId}`;
    const timer = this.graceTimers.get(key);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(key);
  }
}
