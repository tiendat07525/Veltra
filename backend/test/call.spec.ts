import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CallGateway } from '../src/call/call.gateway';
import {
  CallService,
  callRecordText,
  formatCallDuration,
} from '../src/call/call.service';
import type { StoredCall } from '../src/call/call-state.service';
import {
  RING_TIMEOUT_MS,
  REJOIN_GRACE_MS,
  SIGNAL_LIMIT,
  SIGNAL_MAX_BYTES,
} from '../src/call/call.constants';
import { TurnService } from '../src/call/turn.service';
import { StartCallDto } from '../src/call/dto/start-call.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { toMessagePayload } from '../src/messages/schemas/message.schema';

const oid = () => new Types.ObjectId();
const CALL_ID = '0b5d3c1e-8f3a-4c2b-9d1e-6a7b8c9d0e1f';
const ICE = [
  { urls: ['turn:turn.example:3478'], username: 'u', credential: 'c' },
];

describe('TurnService', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as any;
  const configured = config({
    CLOUDFLARE_TURN_KEY_ID: ' key-1 ',
    CLOUDFLARE_TURN_API_TOKEN: 'secret',
  });
  afterEach(() => jest.restoreAllMocks());

  it('parse keeps known fields, drops port 53 and entries left without URLs', () => {
    expect(
      TurnService.parse({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          {
            urls: [
              'turn:turn.cloudflare.com:3478?transport=udp',
              'turn:turn.cloudflare.com:53?transport=udp',
              'turns:turn.cloudflare.com:443?transport=tcp',
            ],
            username: 'u',
            credential: 'c',
            extra: 'x',
          },
          { urls: ['stun:stun.cloudflare.com:53'] },
          null,
        ],
      }),
    ).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username: 'u',
        credential: 'c',
      },
    ]);
    expect(TurnService.parse(null)).toEqual([]);
  });

  it('without key id / token: 503 and no request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      new TurnService(config({ CLOUDFLARE_TURN_KEY_ID: 'k' })).iceServers(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks Cloudflare with the token and a TTL, returns the parsed servers', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ iceServers: [{ urls: ['turn:t:3478'] }] }),
          { status: 201 },
        ),
      );
    const servers = await new TurnService(configured).iceServers();
    expect(servers).toEqual([{ urls: ['turn:t:3478'] }]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers',
    );
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret',
    );
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 7200 });
  });

  it('an HTTP error, a network error or an empty list is 503', async () => {
    const service = new TurnService(configured);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('no', { status: 401 }))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ iceServers: [] }), { status: 201 }),
      );
    for (let i = 0; i < 3; i++) {
      await expect(service.iceServers()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });
});

describe('call record text / payload', () => {
  it('formats durations and the stored text', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(65)).toBe('1:05');
    expect(formatCallDuration(3725)).toBe('1:02:05');
    expect(
      callRecordText({ media: 'audio', status: 'completed', durationSec: 65 }),
    ).toBe('Cuộc gọi thoại · 1:05');
    expect(
      callRecordText({ media: 'video', status: 'completed', durationSec: 5 }),
    ).toBe('Cuộc gọi video · 0:05');
    expect(callRecordText({ media: 'video', status: 'missed' })).toBe(
      'Cuộc gọi nhỡ',
    );
    expect(callRecordText({ media: 'audio', status: 'declined' })).toBe(
      'Cuộc gọi bị từ chối',
    );
  });

  it('a call message carries type and call; other messages do not', () => {
    const base = {
      _id: oid(),
      conversationId: oid(),
      senderId: oid(),
      content: 'Cuộc gọi nhỡ',
      seq: 3,
    };
    expect(
      toMessagePayload({
        ...base,
        type: 'call',
        call: { media: 'audio', status: 'missed' },
      } as any),
    ).toMatchObject({
      type: 'call',
      call: { media: 'audio', status: 'missed' },
    });
    const text = toMessagePayload(base as any);
    expect(text).not.toHaveProperty('type');
    expect(text).not.toHaveProperty('call');
  });

  it('StartCallDto: a conversation id and audio / video only', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(StartCallDto, body))).map(
        (e) => e.property,
      );
    expect(
      await errors({ conversationId: oid().toString(), media: 'video' }),
    ).toEqual([]);
    expect(await errors({ conversationId: 'x', media: 'screen' })).toEqual([
      'conversationId',
      'media',
    ]);
  });
});

describe('CallService', () => {
  const caller = oid().toString();
  const callee = oid().toString();
  const conversationId = oid().toString();

  let conversation: any;
  let conversationModel: { findOne: jest.Mock };
  let friendModel: { exists: jest.Mock };
  let callState: Record<string, jest.Mock>;
  let turn: { iceServers: jest.Mock };
  let realtime: { emitToUser: jest.Mock; emitToSocket: jest.Mock };
  let messageService: { recordCall: jest.Mock };
  let usersService: { findPublicProfile: jest.Mock };
  let service: CallService;

  const ringing = (over: Partial<StoredCall> = {}): StoredCall => ({
    id: CALL_ID,
    conversationId,
    callerId: caller,
    calleeId: callee,
    media: 'audio',
    state: 'ringing',
    createdAt: new Date().toISOString(),
    ...over,
  });
  const dto = { conversationId, media: 'audio' } as StartCallDto;
  const eventsTo = (user: string, event: string) =>
    realtime.emitToUser.mock.calls
      .filter(([u, e]) => u === user && e === event)
      .map(([, , payload]) => payload);

  beforeEach(() => {
    conversation = {
      _id: new Types.ObjectId(conversationId),
      type: 'direct',
      participants: [
        { userId: new Types.ObjectId(caller) },
        { userId: new Types.ObjectId(callee) },
      ],
    };
    conversationModel = {
      findOne: jest.fn(() => ({
        lean: jest.fn(() => Promise.resolve(conversation)),
      })),
    };
    friendModel = { exists: jest.fn().mockResolvedValue({ _id: oid() }) };
    callState = {
      start: jest.fn().mockResolvedValue('OK'),
      accept: jest.fn().mockResolvedValue('OK'),
      join: jest.fn(),
      finish: jest.fn(),
      get: jest.fn(),
      activeFor: jest.fn(),
    };
    turn = { iceServers: jest.fn().mockResolvedValue(ICE) };
    realtime = { emitToUser: jest.fn(), emitToSocket: jest.fn() };
    messageService = { recordCall: jest.fn().mockResolvedValue({}) };
    usersService = {
      findPublicProfile: jest.fn((id: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(id),
          username: `u${id.slice(-3)}`,
        }),
      ),
    };
    service = new CallService(
      conversationModel as any,
      friendModel as any,
      callState as any,
      turn as any,
      realtime as any,
      messageService as any,
      usersService as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('rings the callee, tells my other tabs, returns ICE servers', async () => {
      const result = await service.start(caller, dto);
      expect(result.iceServers).toBe(ICE);
      expect(result.call).toMatchObject({
        conversationId,
        callerId: caller,
        calleeId: callee,
        media: 'audio',
        state: 'ringing',
      });
      expect(conversationModel.findOne.mock.calls[0][0]).toEqual({
        _id: new Types.ObjectId(conversationId),
        'participants.userId': new Types.ObjectId(caller),
      });
      // friend rows are sorted
      const [a, b] = [caller, callee].sort();
      expect(friendModel.exists).toHaveBeenCalledWith({
        user: new Types.ObjectId(a),
        friend: new Types.ObjectId(b),
      });
      expect(eventsTo(callee, 'call:incoming')).toEqual([
        {
          call: result.call,
          caller: expect.objectContaining({ _id: caller, avatarUrl: null }),
        },
      ]);
      expect(eventsTo(caller, 'call:updated')).toEqual([{ call: result.call }]);
      expect(messageService.recordCall).not.toHaveBeenCalled();
    });

    it('a non-member: 404; a group: 400; not friends: 403; no TURN: 503, nothing stored', async () => {
      conversation = null;
      await expect(service.start(caller, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      conversation = {
        _id: oid(),
        type: 'group',
        participants: [
          { userId: new Types.ObjectId(caller) },
          { userId: oid() },
        ],
      };
      await expect(service.start(caller, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      conversation = {
        _id: oid(),
        type: 'direct',
        participants: [
          { userId: new Types.ObjectId(caller) },
          { userId: new Types.ObjectId(callee) },
        ],
      };
      friendModel.exists.mockResolvedValueOnce(null);
      await expect(service.start(caller, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      turn.iceServers.mockRejectedValueOnce(new ServiceUnavailableException());
      await expect(service.start(caller, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(callState.start).not.toHaveBeenCalled();
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    });

    it('I am in a call: 409, nothing recorded; the callee is: 409 and a missed call for them', async () => {
      callState.start.mockResolvedValueOnce('CALLER_BUSY');
      await expect(service.start(caller, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(messageService.recordCall).not.toHaveBeenCalled();

      callState.start.mockResolvedValueOnce('CALLEE_BUSY');
      await expect(service.start(caller, dto)).rejects.toThrow(
        'Người nhận đang bận',
      );
      expect(messageService.recordCall).toHaveBeenCalledWith(
        conversationId,
        caller,
        expect.any(String),
        { media: 'audio', status: 'missed' },
        'Cuộc gọi nhỡ',
      );
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    });

    it('unanswered after the ring timeout: finished as missed (only while still ringing)', async () => {
      jest.useFakeTimers();
      const { call } = await service.start(caller, dto);
      callState.finish.mockResolvedValueOnce(ringing({ id: call.id }));
      jest.advanceTimersByTime(RING_TIMEOUT_MS);
      await jest.runOnlyPendingTimersAsync();
      expect(callState.finish).toHaveBeenCalledWith(
        expect.objectContaining({ id: call.id }),
        { state: 'ringing' },
      );
      expect(eventsTo(callee, 'call:updated')).toEqual([
        { call: { ...call, state: 'ended' }, reason: 'missed' },
      ]);
      expect(messageService.recordCall.mock.calls[0][3]).toEqual({
        media: 'audio',
        status: 'missed',
      });
    });
  });

  describe('accept / decline / end', () => {
    it('accept: callee only, ringing only, TURN before the state changes', async () => {
      callState.get.mockResolvedValue(ringing());
      await expect(service.accept(caller, CALL_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.accept(oid().toString(), CALL_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.accept(callee, 'not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      turn.iceServers.mockRejectedValueOnce(new ServiceUnavailableException());
      await expect(service.accept(callee, CALL_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(callState.accept).not.toHaveBeenCalled();

      const result = await service.accept(callee, CALL_ID);
      expect(result.call.state).toBe('active');
      expect(result.call.acceptedAt).toEqual(expect.any(String));
      expect(result.iceServers).toBe(ICE);
      expect(eventsTo(caller, 'call:updated')).toEqual([{ call: result.call }]);
      expect(eventsTo(callee, 'call:updated')).toEqual([{ call: result.call }]);

      callState.accept.mockResolvedValueOnce('CONFLICT');
      await expect(service.accept(callee, CALL_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('decline: recorded as declined; already over: 409', async () => {
      callState.get.mockResolvedValue(ringing());
      callState.finish.mockResolvedValueOnce(ringing());
      await service.decline(callee, CALL_ID);
      expect(callState.finish).toHaveBeenCalledWith(ringing(), {
        state: 'ringing',
      });
      expect(messageService.recordCall.mock.calls[0][3]).toEqual({
        media: 'audio',
        status: 'declined',
      });
      expect(eventsTo(caller, 'call:updated')[0]).toMatchObject({
        reason: 'declined',
      });

      callState.finish.mockResolvedValueOnce(null);
      await expect(service.decline(callee, CALL_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.decline(caller, CALL_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('end: caller while ringing = canceled (missed); active = ended with the duration', async () => {
      callState.get.mockResolvedValueOnce(ringing());
      callState.finish.mockResolvedValueOnce(ringing());
      await service.end(caller, CALL_ID);
      expect(eventsTo(callee, 'call:updated')[0]).toMatchObject({
        reason: 'canceled',
      });
      expect(messageService.recordCall.mock.calls[0][3]).toEqual({
        media: 'audio',
        status: 'missed',
      });

      const active = ringing({
        state: 'active',
        media: 'video',
        acceptedAt: new Date(Date.now() - 65_000).toISOString(),
      });
      callState.get.mockResolvedValueOnce(active);
      callState.finish.mockResolvedValueOnce(active);
      await service.end(callee, CALL_ID);
      expect(callState.finish).toHaveBeenLastCalledWith(active, {
        state: 'active',
      });
      const [, , , record, text] = messageService.recordCall.mock.calls[1];
      expect(record).toEqual({
        media: 'video',
        status: 'completed',
        durationSec: 65,
      });
      expect(text).toBe('Cuộc gọi video · 1:05');
      expect(eventsTo(caller, 'call:updated')[1]).toMatchObject({
        reason: 'ended',
        durationSec: 65,
        call: { state: 'ended' },
      });
    });

    it('end races an accept: retried as an active call; a call already over is fine', async () => {
      const active = ringing({
        state: 'active',
        acceptedAt: new Date().toISOString(),
      });
      callState.get
        .mockResolvedValueOnce(ringing())
        .mockResolvedValueOnce(active);
      callState.finish
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(active);
      await service.end(caller, CALL_ID);
      expect(callState.finish.mock.calls.map(([, when]) => when)).toEqual([
        { state: 'ringing' },
        { state: 'active' },
      ]);
      expect(messageService.recordCall).toHaveBeenCalledTimes(1);
      expect(messageService.recordCall.mock.calls[0][3].status).toBe(
        'completed',
      );

      callState.get.mockResolvedValueOnce(null);
      await expect(service.end(caller, CALL_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('a failed record is logged; the call still ends', async () => {
      callState.get.mockResolvedValueOnce(ringing());
      callState.finish.mockResolvedValueOnce(ringing());
      messageService.recordCall.mockRejectedValueOnce(new Error('db down'));
      await expect(service.end(caller, CALL_ID)).resolves.toEqual({ ok: true });
      expect(eventsTo(callee, 'call:updated')).toHaveLength(1);
    });
  });

  describe('getActive / join / socketLeft', () => {
    it('getActive: none, or the call with the peer; ICE only for a party that can join', async () => {
      callState.activeFor.mockResolvedValueOnce(null);
      expect(await service.getActive(caller)).toEqual({ call: null });

      callState.activeFor.mockResolvedValueOnce(ringing());
      const mine = await service.getActive(callee);
      expect(mine).toMatchObject({ peer: { _id: caller } });
      expect(mine).not.toHaveProperty('iceServers');

      callState.activeFor.mockResolvedValueOnce(ringing());
      expect(await service.getActive(caller)).toMatchObject({
        iceServers: ICE,
      });

      // TURN down: still answers, without ICE
      callState.activeFor.mockResolvedValueOnce(ringing());
      turn.iceServers.mockRejectedValueOnce(new ServiceUnavailableException());
      expect(await service.getActive(caller)).not.toHaveProperty('iceServers');
    });

    it('join tells the peer socket; an invalid id is NOT_FOUND without Redis', async () => {
      expect(await service.join(caller, '../x', 's1')).toEqual({
        ok: false,
        code: 'NOT_FOUND',
      });
      expect(callState.get).not.toHaveBeenCalled();

      callState.get.mockResolvedValue(ringing({ state: 'active' }));
      callState.join.mockResolvedValueOnce({
        ok: true,
        role: 'callee',
        state: 'active',
        previousSocket: '',
        peerSocket: 'caller-socket',
      });
      await service.join(callee, CALL_ID, 'callee-socket');
      expect(realtime.emitToSocket).toHaveBeenCalledWith(
        'caller-socket',
        'call:peer-joined',
        { callId: CALL_ID, role: 'callee' },
      );
    });

    it('a dropped socket ends the call after the grace window, unless it re-joined', async () => {
      jest.useFakeTimers();
      const active = ringing({
        state: 'active',
        acceptedAt: new Date().toISOString(),
        callerSocket: 's1',
      });
      callState.get.mockResolvedValue(active);

      // Re-joined with s2 in time: the timer for s1 is gone
      service.socketLeft(CALL_ID, 'caller', 's1');
      callState.join.mockResolvedValueOnce({
        ok: true,
        role: 'caller',
        state: 'active',
        previousSocket: 's1',
        peerSocket: '',
      });
      await service.join(caller, CALL_ID, 's2');
      await jest.advanceTimersByTimeAsync(REJOIN_GRACE_MS);
      expect(callState.finish).not.toHaveBeenCalled();

      // s2 drops and nobody comes back
      service.socketLeft(CALL_ID, 'caller', 's2');
      callState.finish.mockResolvedValueOnce(active);
      await jest.advanceTimersByTimeAsync(REJOIN_GRACE_MS);
      expect(callState.finish).toHaveBeenCalledWith(active, {
        socket: { role: 'caller', id: 's2' },
      });
      expect(eventsTo(callee, 'call:updated')[0]).toMatchObject({
        reason: 'dropped',
      });
      expect(messageService.recordCall.mock.calls[0][3].status).toBe(
        'completed',
      );
    });
  });
});

describe('CallGateway', () => {
  const userId = oid().toString();
  let callService: {
    join: jest.Mock;
    signalTarget: jest.Mock;
    socketLeft: jest.Mock;
  };
  let realtime: { emitToSocket: jest.Mock };
  let gateway: CallGateway;
  const socket = (data: Record<string, unknown> = {}) =>
    ({ id: 'sock-1', data: { user: { _id: userId }, ...data } }) as any;

  beforeEach(() => {
    callService = {
      join: jest.fn().mockResolvedValue({
        ok: true,
        role: 'caller',
        state: 'ringing',
        previousSocket: '',
        peerSocket: '',
      }),
      signalTarget: jest
        .fn()
        .mockResolvedValue({ ok: true, peerSocket: 'peer' }),
      socketLeft: jest.fn(),
    };
    realtime = { emitToSocket: jest.fn() };
    gateway = new CallGateway(callService as any, realtime as any);
  });

  it('join binds the socket and acks the role', async () => {
    const client = socket();
    expect(await gateway.handleJoin(client, { callId: CALL_ID })).toEqual({
      ok: true,
      data: { role: 'caller', state: 'ringing', peerJoined: false },
    });
    expect(client.data).toMatchObject({ callId: CALL_ID, callRole: 'caller' });
    expect(callService.join).toHaveBeenCalledWith(userId, CALL_ID, 'sock-1');

    callService.join.mockResolvedValueOnce({ ok: false, code: 'NOT_ACCEPTED' });
    expect(
      await gateway.handleJoin(socket(), { callId: CALL_ID }),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_ACCEPTED' },
    });
    expect(await gateway.handleJoin(socket(), {})).toMatchObject({
      error: { code: 'BAD_REQUEST' },
    });
    expect(
      await gateway.handleJoin({ id: 'x', data: {} } as any, {
        callId: CALL_ID,
      }),
    ).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('signal: only for the joined call, size-limited, rate-limited, relayed as is', async () => {
    const client = socket({ callId: CALL_ID, callRole: 'caller' });
    const data = { type: 'offer', sdp: 'v=0' };
    expect(
      await gateway.handleSignal(client, { callId: CALL_ID, data }),
    ).toEqual({
      ok: true,
    });
    expect(realtime.emitToSocket).toHaveBeenCalledWith('peer', 'call:signal', {
      callId: CALL_ID,
      data,
    });

    expect(
      await gateway.handleSignal(socket(), { callId: CALL_ID, data }),
    ).toMatchObject({ error: { code: 'NOT_JOINED' } });
    // Joined to another call
    expect(
      await gateway.handleSignal(
        socket({ callId: 'other-call', callRole: 'caller' }),
        { callId: CALL_ID, data },
      ),
    ).toMatchObject({ error: { code: 'NOT_JOINED' } });
    expect(
      await gateway.handleSignal(client, {
        callId: CALL_ID,
        data: 'x'.repeat(SIGNAL_MAX_BYTES),
      }),
    ).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(
      await gateway.handleSignal(client, { callId: CALL_ID }),
    ).toMatchObject({
      error: { code: 'BAD_REQUEST' },
    });

    const burst = socket({ callId: CALL_ID, callRole: 'caller' });
    const acks: { ok: boolean }[] = [];
    for (let i = 0; i <= SIGNAL_LIMIT; i++) {
      acks.push(await gateway.handleSignal(burst, { callId: CALL_ID, data }));
    }
    expect(acks.filter((a) => a.ok)).toHaveLength(SIGNAL_LIMIT);
    expect(acks[SIGNAL_LIMIT]).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('signal: peer not joined keeps the binding; a replaced socket loses it', async () => {
    const client = socket({ callId: CALL_ID, callRole: 'caller' });
    callService.signalTarget.mockResolvedValueOnce({
      ok: false,
      code: 'PEER_NOT_JOINED',
    });
    expect(
      await gateway.handleSignal(client, { callId: CALL_ID, data: {} }),
    ).toMatchObject({ error: { code: 'PEER_NOT_JOINED' } });
    expect(client.data.callId).toBe(CALL_ID);

    callService.signalTarget.mockResolvedValueOnce({
      ok: false,
      code: 'NOT_JOINED',
    });
    await gateway.handleSignal(client, { callId: CALL_ID, data: {} });
    expect(client.data.callId).toBeUndefined();
    expect(realtime.emitToSocket).not.toHaveBeenCalled();
  });

  it('disconnect of a joined socket starts the grace window; others do nothing', () => {
    gateway.handleDisconnect(socket());
    expect(callService.socketLeft).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket({ callId: CALL_ID, callRole: 'callee' }));
    expect(callService.socketLeft).toHaveBeenCalledWith(
      CALL_ID,
      'callee',
      'sock-1',
    );
  });
});
