import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type { CallMedia, CallRole, CallState } from './call.constants';

type RedisClient = ReturnType<typeof createClient>;

// A call as stored in Redis (hash call:{id}); never in MongoDB
export interface StoredCall {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  state: CallState;
  createdAt: string;
  acceptedAt?: string;
  // Socket each party joined with (call:join); absent until then
  callerSocket?: string;
  calleeSocket?: string;
}

export type StartResult = 'OK' | 'CALLER_BUSY' | 'CALLEE_BUSY';
export type AcceptResult = 'OK' | 'NOT_FOUND' | 'CONFLICT';
export type JoinResult =
  | { ok: false; code: 'NOT_FOUND' | 'NOT_ACCEPTED' }
  | {
      ok: true;
      role: CallRole;
      state: CallState;
      // Socket this party had joined with before ('' = none)
      previousSocket: string;
      // The other party's joined socket ('' = not joined)
      peerSocket: string;
    };

const callKey = (callId: string) => `call:${callId}`;
const lockKey = (userId: string) => `call:user:${userId}`;

// KEYS: lock caller, lock callee, call. ARGV: callId, ttl, field/value pairs.
// A lock whose call no longer exists is stale and ignored.
const START = `
for i = 1, 2 do
  local held = redis.call('GET', KEYS[i])
  if held and redis.call('EXISTS', 'call:' .. held) == 1 then
    return i == 1 and 'CALLER_BUSY' or 'CALLEE_BUSY'
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
redis.call('HSET', KEYS[3], unpack(ARGV, 3))
redis.call('EXPIRE', KEYS[3], ARGV[2])
return 'OK'
`;

// KEYS: call, lock caller, lock callee. ARGV: callId, calleeId, acceptedAt, ttl.
// Only the callee, only while ringing: of two tabs accepting at once, one gets OK.
const ACCEPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_FOUND' end
if redis.call('HGET', KEYS[1], 'calleeId') ~= ARGV[2] then return 'NOT_FOUND' end
if redis.call('HGET', KEYS[1], 'state') ~= 'ringing' then return 'CONFLICT' end
redis.call('HSET', KEYS[1], 'state', 'active', 'acceptedAt', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
for i = 2, 3 do
  if redis.call('GET', KEYS[i]) == ARGV[1] then redis.call('EXPIRE', KEYS[i], ARGV[4]) end
end
return 'OK'
`;

// KEYS: call, lock caller, lock callee. ARGV: callId, userId, socketId, ttl.
// Binds the party's socket and renews the keys (the client repeats it as a heartbeat).
const JOIN = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {'NOT_FOUND'} end
local state = redis.call('HGET', KEYS[1], 'state')
local role
if redis.call('HGET', KEYS[1], 'callerId') == ARGV[2] then role = 'caller'
elseif redis.call('HGET', KEYS[1], 'calleeId') == ARGV[2] then role = 'callee'
else return {'NOT_FOUND'} end
if role == 'callee' and state ~= 'active' then return {'NOT_ACCEPTED'} end
local mine = role .. 'Socket'
local peer = role == 'caller' and 'calleeSocket' or 'callerSocket'
local previous = redis.call('HGET', KEYS[1], mine) or ''
redis.call('HSET', KEYS[1], mine, ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
for i = 2, 3 do
  if redis.call('GET', KEYS[i]) == ARGV[1] then redis.call('EXPIRE', KEYS[i], ARGV[4]) end
end
return {'OK', role, state, previous, redis.call('HGET', KEYS[1], peer) or ''}
`;

// KEYS: call, lock caller, lock callee. ARGV: callId, required state ('' = any),
// required field ('' = none), its required value. Deletes the call and its locks and returns
// the stored hash, or nil when it is gone or a condition fails: exactly one caller ends a call.
const FINISH = `
local h = redis.call('HGETALL', KEYS[1])
if #h == 0 then return nil end
local f = {}
for i = 1, #h, 2 do f[h[i]] = h[i + 1] end
if ARGV[2] ~= '' and f['state'] ~= ARGV[2] then return nil end
if ARGV[3] ~= '' and f[ARGV[3]] ~= ARGV[4] then return nil end
redis.call('DEL', KEYS[1])
for i = 2, 3 do
  if redis.call('GET', KEYS[i]) == ARGV[1] then redis.call('DEL', KEYS[i]) end
end
return h
`;

const toCall = (fields: Record<string, string>): StoredCall | null =>
  fields && fields.id
    ? {
        id: fields.id,
        conversationId: fields.conversationId,
        callerId: fields.callerId,
        calleeId: fields.calleeId,
        media: fields.media as CallMedia,
        state: fields.state as CallState,
        createdAt: fields.createdAt,
        ...(fields.acceptedAt ? { acceptedAt: fields.acceptedAt } : {}),
        ...(fields.callerSocket ? { callerSocket: fields.callerSocket } : {}),
        ...(fields.calleeSocket ? { calleeSocket: fields.calleeSocket } : {}),
      }
    : null;

const pairsToObject = (pairs: string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < pairs.length; i += 2) out[pairs[i]] = pairs[i + 1];
  return out;
};

/**
 * Call state in Redis: call:{id} (hash) and call:user:{userId} → callId (one call per user).
 * Every transition is one Lua script, so concurrent requests (two tabs, accept vs hang up)
 * resolve to exactly one winner. Keys expire after CALL_KEY_TTL_S unless call:join renews them.
 */
@Injectable()
export class CallStateService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClient;
  private readonly logger = new Logger(CallStateService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const url =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.client = createClient({ url });
    this.client.on('error', (err: unknown) =>
      this.logger.error('Redis Client Error', err),
    );
    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.quit();
  }

  async start(call: StoredCall, ttlSeconds: number): Promise<StartResult> {
    const fields = Object.entries(call)
      .filter(([, v]) => v !== undefined)
      .flatMap(([k, v]) => [k, String(v)]);
    return (await this.client.eval(START, {
      keys: [lockKey(call.callerId), lockKey(call.calleeId), callKey(call.id)],
      arguments: [call.id, String(ttlSeconds), ...fields],
    })) as StartResult;
  }

  async accept(
    call: StoredCall,
    calleeId: string,
    acceptedAt: string,
    ttlSeconds: number,
  ): Promise<AcceptResult> {
    return (await this.client.eval(ACCEPT, {
      keys: this.keysOf(call),
      arguments: [call.id, calleeId, acceptedAt, String(ttlSeconds)],
    })) as AcceptResult;
  }

  async join(
    call: StoredCall,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<JoinResult> {
    const reply = (await this.client.eval(JOIN, {
      keys: this.keysOf(call),
      arguments: [call.id, userId, socketId, String(ttlSeconds)],
    })) as string[];
    if (reply[0] !== 'OK') {
      return { ok: false, code: reply[0] as 'NOT_FOUND' | 'NOT_ACCEPTED' };
    }
    return {
      ok: true,
      role: reply[1] as CallRole,
      state: reply[2] as CallState,
      previousSocket: reply[3],
      peerSocket: reply[4],
    };
  }

  // Ends the call if it still matches; the stored call for the one caller that ended it
  async finish(
    call: StoredCall,
    when: { state?: CallState; socket?: { role: CallRole; id: string } } = {},
  ): Promise<StoredCall | null> {
    const reply = (await this.client.eval(FINISH, {
      keys: this.keysOf(call),
      arguments: [
        call.id,
        when.state ?? '',
        when.socket ? `${when.socket.role}Socket` : '',
        when.socket?.id ?? '',
      ],
    })) as string[] | null;
    return reply ? toCall(pairsToObject(reply)) : null;
  }

  async get(callId: string): Promise<StoredCall | null> {
    return toCall(await this.client.hGetAll(callKey(callId)));
  }

  // The user's current call (ringing or active), if any
  async activeFor(userId: string): Promise<StoredCall | null> {
    const callId = await this.client.get(lockKey(userId));
    if (!callId) return null;
    const call = await this.get(callId);
    // A lock may outlive its call by a few ms; it is not a call
    return call && (call.callerId === userId || call.calleeId === userId)
      ? call
      : null;
  }

  private keysOf(call: StoredCall) {
    return [callKey(call.id), lockKey(call.callerId), lockKey(call.calleeId)];
  }
}
