import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { errorMessage } from '../common/error-message';
import { GATEWAY_OPTIONS } from '../realtime/gateway-options';
import { ackError } from '../realtime/realtime.gateway';
import type { SocketAck } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  GatewaySocket,
  GatewaySocketData,
} from '../realtime/socket-auth.middleware';
import {
  JOIN_LIMIT,
  JOIN_WINDOW_MS,
  SIGNAL_LIMIT,
  SIGNAL_MAX_BYTES,
  SIGNAL_WINDOW_MS,
} from './call.constants';
import type { CallRole, CallState } from './call.constants';
import { CallService } from './call.service';

type Counter = 'callJoin' | 'callSignal';

// Fixed-window per-socket limit on socket.data; false when this call is over the limit
function takeToken(
  data: GatewaySocketData,
  counter: Counter,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const startKey = `${counter}WindowStart` as const;
  const countKey = `${counter}Count` as const;
  const start = data[startKey];
  if (start === undefined || now - start >= windowMs) {
    data[startKey] = now;
    data[countKey] = 0;
  }
  const count = data[countKey] ?? 0;
  if (count >= limit) return false;
  data[countKey] = count + 1;
  return true;
}

const callIdOf = (body: unknown) => {
  const id =
    body && typeof body === 'object'
      ? (body as { callId?: unknown }).callId
      : undefined;
  return typeof id === 'string' ? id : undefined;
};

/**
 * Call signaling (realtime.md §4 Calls) on the same Socket.IO server as RealtimeGateway (same auth
 * middleware, same rooms). WebRTC offers / answers / ICE candidates are relayed as opaque data
 * between the two sockets bound to the call; the server never reads or stores them.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class CallGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(CallGateway.name);

  constructor(
    private readonly callService: CallService,
    private readonly realtime: RealtimeService,
  ) {}

  // Bind this socket to the call; repeated by the client as a heartbeat while the call lasts
  @SubscribeMessage('call:join')
  async handleJoin(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: unknown,
  ): Promise<
    SocketAck<{ role: CallRole; state: CallState; peerJoined: boolean }>
  > {
    const userId = client.data?.user?._id;
    if (!userId) return ackError('UNAUTHORIZED', 'Chưa xác thực');
    const callId = callIdOf(body);
    if (!callId) return ackError('BAD_REQUEST', 'callId không hợp lệ');
    if (!takeToken(client.data, 'callJoin', JOIN_LIMIT, JOIN_WINDOW_MS)) {
      return ackError('RATE_LIMITED', 'Gửi quá nhanh');
    }
    try {
      const result = await this.callService.join(userId, callId, client.id);
      if (!result.ok) {
        return result.code === 'NOT_ACCEPTED'
          ? ackError('NOT_ACCEPTED', 'Cuộc gọi chưa được trả lời')
          : ackError('NOT_FOUND', 'Không tìm thấy cuộc gọi');
      }
      client.data.callId = callId;
      client.data.callRole = result.role;
      return {
        ok: true,
        data: {
          role: result.role,
          state: result.state,
          peerJoined: Boolean(result.peerSocket),
        },
      };
    } catch (err: unknown) {
      this.logger.warn(`[Call] join lỗi: ${errorMessage(err)}`);
      return ackError('INTERNAL', 'Không thể vào cuộc gọi');
    }
  }

  // Relay one WebRTC message (offer / answer / candidate) to the peer's bound socket
  @SubscribeMessage('call:signal')
  async handleSignal(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    const userId = client.data?.user?._id;
    if (!userId) return ackError('UNAUTHORIZED', 'Chưa xác thực');
    const callId = callIdOf(body);
    const role = client.data.callRole;
    if (!callId || callId !== client.data.callId || !role) {
      return ackError('NOT_JOINED', 'Chưa vào cuộc gọi');
    }
    const data = (body as { data?: unknown }).data;
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
    } catch {
      return ackError('BAD_REQUEST', 'Dữ liệu không hợp lệ');
    }
    if (data === undefined || size > SIGNAL_MAX_BYTES) {
      return ackError('BAD_REQUEST', 'Dữ liệu không hợp lệ');
    }
    if (!takeToken(client.data, 'callSignal', SIGNAL_LIMIT, SIGNAL_WINDOW_MS)) {
      return ackError('RATE_LIMITED', 'Gửi quá nhanh');
    }
    try {
      const target = await this.callService.signalTarget(
        callId,
        role,
        client.id,
      );
      if (!target.ok) {
        if (target.code !== 'PEER_NOT_JOINED') {
          client.data.callId = undefined;
          client.data.callRole = undefined;
        }
        return ackError(
          target.code,
          target.code === 'PEER_NOT_JOINED'
            ? 'Người kia chưa vào cuộc gọi'
            : 'Không tìm thấy cuộc gọi',
        );
      }
      this.realtime.emitToSocket(target.peerSocket, 'call:signal', {
        callId,
        data,
      });
      return { ok: true };
    } catch (err: unknown) {
      this.logger.warn(`[Call] signal lỗi: ${errorMessage(err)}`);
      return ackError('INTERNAL', 'Không thể gửi tín hiệu cuộc gọi');
    }
  }

  handleDisconnect(client: GatewaySocket) {
    const { callId, callRole } = client.data ?? {};
    if (callId && callRole) {
      this.callService.socketLeft(callId, callRole, client.id);
    }
  }
}
