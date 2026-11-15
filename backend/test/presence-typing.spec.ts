import { Types } from 'mongoose';
import {
  OFFLINE_GRACE_MS,
  PresenceService,
} from '../src/realtime/presence.service';
import {
  RealtimeGateway,
  TYPING_MIN_INTERVAL_MS,
} from '../src/realtime/realtime.gateway';

const oid = () => new Types.ObjectId();

// Fake Socket.IO server: `online` maps userId -> number of connected sockets
const fakeServer = (online: Map<string, number>) => ({
  in: jest.fn((rooms: string | string[]) => ({
    fetchSockets: jest.fn(() => {
      const list = Array.isArray(rooms) ? rooms : [rooms];
      const sockets: { data: { user: { _id: string } } }[] = [];
      for (const room of list) {
        const id = room.replace(/^user:/, '');
        for (let i = 0; i < (online.get(id) ?? 0); i++) {
          sockets.push({ data: { user: { _id: id } } });
        }
      }
      return Promise.resolve(sockets);
    }),
  })),
});

const lean = <T>(value: T) => ({ lean: jest.fn().mockResolvedValue(value) });

describe('PresenceService', () => {
  const me = oid();
  const friend = oid();
  const coMember = oid();
  const stranger = oid();

  let online: Map<string, number>;
  let friendModel: { find: jest.Mock };
  let conversationModel: { find: jest.Mock; findOne: jest.Mock };
  let realtimeService: { getServer: jest.Mock; emitToUser: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    online = new Map();
    friendModel = {
      // normalized pair: either side may be `me`
      find: jest.fn(() => lean([{ user: friend, friend: me }])),
    };
    conversationModel = {
      find: jest.fn(() =>
        lean([
          { participants: [{ userId: me }, { userId: coMember }] },
          { participants: [{ userId: me }, { userId: friend }] },
        ]),
      ),
      findOne: jest.fn(),
    };
    const server = fakeServer(online);
    realtimeService = {
      getServer: jest.fn(() => server),
      emitToUser: jest.fn(),
    };
    service = new PresenceService(
      friendModel as any,
      conversationModel as any,
      realtimeService as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('audience = friends + co-members, unique, without self', async () => {
    const audience = await service.audienceOf(me.toString());
    expect(audience.sort()).toEqual(
      [friend.toString(), coMember.toString()].sort(),
    );
    expect(friendModel.find).toHaveBeenCalledWith(
      { $or: [{ user: me }, { friend: me }] },
      expect.anything(),
    );
  });

  it('audience is empty for an invalid id (no query)', async () => {
    expect(await service.audienceOf('not-an-id')).toEqual([]);
    expect(friendModel.find).not.toHaveBeenCalled();
  });

  it('presence:sync returns only online audience members', async () => {
    online.set(friend.toString(), 2);
    online.set(stranger.toString(), 1);
    expect(await service.onlineAudience(me.toString())).toEqual([
      friend.toString(),
    ]);
  });

  it('first socket announces online to the audience only', async () => {
    online.set(me.toString(), 1);
    await service.handleConnected(me.toString());

    const targets = realtimeService.emitToUser.mock.calls.map((c) => c[0]);
    expect(targets.sort()).toEqual(
      [friend.toString(), coMember.toString()].sort(),
    );
    for (const call of realtimeService.emitToUser.mock.calls) {
      expect(call[1]).toBe('presence');
      expect(call[2]).toEqual({ userId: me.toString(), status: 'online' });
    }
  });

  it('a second socket (another tab) does not announce again', async () => {
    online.set(me.toString(), 2);
    await service.handleConnected(me.toString());
    expect(realtimeService.emitToUser).not.toHaveBeenCalled();
  });

  it('announces offline only after the grace window when no socket is back', async () => {
    jest.useFakeTimers();
    service.handleDisconnected(me.toString());

    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS - 1);
    expect(realtimeService.emitToUser).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(realtimeService.emitToUser).toHaveBeenCalledWith(
      friend.toString(),
      'presence',
      { userId: me.toString(), status: 'offline' },
    );
  });

  it('reconnecting within the grace window cancels offline (reload)', async () => {
    jest.useFakeTimers();
    service.handleDisconnected(me.toString());
    await jest.advanceTimersByTimeAsync(5_000);

    // the reloaded tab is the only socket again → "online" is re-sent, never "offline"
    online.set(me.toString(), 1);
    await service.handleConnected(me.toString());
    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);

    const statuses = realtimeService.emitToUser.mock.calls.map(
      (c) => (c[2] as { status: string }).status,
    );
    expect(statuses).not.toContain('offline');
  });

  it('no offline when a socket on another instance is still connected', async () => {
    jest.useFakeTimers();
    online.set(me.toString(), 1);
    service.handleDisconnected(me.toString());
    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);
    expect(realtimeService.emitToUser).not.toHaveBeenCalled();
  });

  it('typing recipients: other members only; null for non-members / bad ids', async () => {
    const conversationId = oid().toString();
    conversationModel.findOne.mockReturnValueOnce(
      lean({ participants: [{ userId: me }, { userId: coMember }] }),
    );
    expect(
      await service.typingRecipients(conversationId, me.toString()),
    ).toEqual([coMember.toString()]);
    expect(conversationModel.findOne).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(conversationId),
        'participants.userId': me,
      },
      expect.anything(),
    );

    conversationModel.findOne.mockReturnValueOnce(lean(null));
    expect(
      await service.typingRecipients(conversationId, stranger.toString()),
    ).toBeNull();

    expect(await service.typingRecipients('bad', me.toString())).toBeNull();
    expect(conversationModel.findOne).toHaveBeenCalledTimes(2);
  });
});

describe('RealtimeGateway presence / typing handlers', () => {
  const me = oid().toString();
  const other = oid().toString();
  const conversationId = oid().toString();

  let presence: {
    onlineAudience: jest.Mock;
    typingRecipients: jest.Mock;
    handleConnected: jest.Mock;
    handleDisconnected: jest.Mock;
  };
  let realtimeService: { emitToUser: jest.Mock };
  let gateway: RealtimeGateway;

  const socket = (userId?: string) =>
    ({
      id: 'sock-1',
      data: userId ? { user: { _id: userId } } : {},
    }) as any;

  beforeEach(() => {
    presence = {
      onlineAudience: jest.fn().mockResolvedValue([other]),
      typingRecipients: jest.fn().mockResolvedValue([other]),
      handleConnected: jest.fn().mockResolvedValue(undefined),
      handleDisconnected: jest.fn(),
    };
    realtimeService = { emitToUser: jest.fn() };
    gateway = new RealtimeGateway(
      {} as any,
      {} as any,
      {} as any,
      realtimeService as any,
      {} as any,
      {} as any,
      presence as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('presence:sync acks the online list for the socket user', async () => {
    await expect(gateway.handlePresenceSync(socket(me))).resolves.toEqual({
      ok: true,
      data: { online: [other] },
    });
    expect(presence.onlineAudience).toHaveBeenCalledWith(me);
  });

  it('presence:sync rejects an unauthenticated socket', async () => {
    const ack = await gateway.handlePresenceSync(socket());
    expect(ack).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('typing:start is relayed to the other members with the socket user id', async () => {
    const ack = await gateway.handleTypingStart(socket(me), {
      conversationId,
      // a spoofed id in the payload is ignored
      userId: other,
    });
    expect(ack).toEqual({ ok: true });
    expect(presence.typingRecipients).toHaveBeenCalledWith(conversationId, me);
    expect(realtimeService.emitToUser).toHaveBeenCalledWith(other, 'typing', {
      conversationId,
      userId: me,
      isTyping: true,
    });
  });

  it('typing:stop sends isTyping=false', async () => {
    await gateway.handleTypingStop(socket(me), { conversationId });
    expect(realtimeService.emitToUser).toHaveBeenCalledWith(other, 'typing', {
      conversationId,
      userId: me,
      isTyping: false,
    });
  });

  it('rejects a non-member (no emit)', async () => {
    presence.typingRecipients.mockResolvedValueOnce(null);
    const ack = await gateway.handleTypingStart(socket(me), {
      conversationId,
    });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(realtimeService.emitToUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload without querying', async () => {
    for (const body of [undefined, null, 'x', { conversationId: 42 }]) {
      const ack = await gateway.handleTypingStart(socket(me), body);
      expect(ack).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    }
    expect(presence.typingRecipients).not.toHaveBeenCalled();
  });

  it('rate-limits typing:start per socket to one per interval', async () => {
    jest.useFakeTimers();
    const client = socket(me);
    expect(await gateway.handleTypingStart(client, { conversationId })).toEqual(
      { ok: true },
    );
    expect(
      await gateway.handleTypingStart(client, { conversationId }),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    // stop has its own budget
    expect(await gateway.handleTypingStop(client, { conversationId })).toEqual({
      ok: true,
    });

    jest.advanceTimersByTime(TYPING_MIN_INTERVAL_MS);
    expect(await gateway.handleTypingStart(client, { conversationId })).toEqual(
      { ok: true },
    );
    expect(realtimeService.emitToUser).toHaveBeenCalledTimes(3);
  });

  it('disconnect schedules the offline check for the socket user', () => {
    gateway.handleDisconnect(socket(me));
    expect(presence.handleDisconnected).toHaveBeenCalledWith(me);
  });
});
