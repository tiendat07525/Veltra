import { ConfigService } from '@nestjs/config';
import { SessionService } from '../src/auth/session.service';

describe('SessionService.revokeAllUserSessions', () => {
  const makeService = (batches: string[][]) => {
    const service = new SessionService({} as ConfigService);
    const client = {
      scanIterator: jest.fn(async function* () {
        for (const batch of batches) {
          await Promise.resolve();
          yield batch;
        }
      }),
      del: jest.fn().mockResolvedValue(0),
      keys: jest.fn(),
    };
    (service as unknown as { client: typeof client }).client = client;
    return { service, client };
  };

  it('should delete every session key collected across SCAN batches', async () => {
    const { service, client } = makeService([
      ['session:u1:a', 'session:u1:b'],
      [],
      ['session:u1:c'],
    ]);

    await service.revokeAllUserSessions('u1');

    expect(client.scanIterator).toHaveBeenCalledWith({
      MATCH: 'session:u1:*',
      COUNT: 100,
    });
    expect(client.del).toHaveBeenCalledTimes(1);
    expect(client.del).toHaveBeenCalledWith([
      'session:u1:a',
      'session:u1:b',
      'session:u1:c',
    ]);
    expect(client.keys).not.toHaveBeenCalled();
  });

  it('should not call DEL when the user has no sessions', async () => {
    const { service, client } = makeService([[], []]);

    await service.revokeAllUserSessions('u1');

    expect(client.del).not.toHaveBeenCalled();
  });
});
