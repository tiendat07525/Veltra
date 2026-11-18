import { ServiceUnavailableException } from '@nestjs/common';
import { ConnectionStates } from 'mongoose';
import type { Connection } from 'mongoose';
import type { SessionService } from 'src/auth/session.service';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  HealthService,
} from 'src/health/health.service';
import { HealthController } from 'src/health/health.controller';

describe('Health', () => {
  let mongoPing: jest.Mock;
  let redisPing: jest.Mock;
  let connection: { readyState: ConnectionStates; db?: unknown };
  let service: HealthService;

  beforeEach(() => {
    mongoPing = jest.fn().mockResolvedValue({ ok: 1 });
    redisPing = jest.fn().mockResolvedValue(undefined);
    connection = {
      readyState: ConnectionStates.connected,
      db: { admin: () => ({ ping: mongoPing }) },
    };
    service = new HealthService(
      connection as unknown as Connection,
      { ping: redisPing } as unknown as SessionService,
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should report ok when MongoDB and Redis answer', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      mongo: 'up',
      redis: 'up',
    });
    expect(mongoPing).toHaveBeenCalledTimes(1);
    expect(redisPing).toHaveBeenCalledTimes(1);
  });

  it('should report mongo down when the connection is not open, without pinging', async () => {
    connection.readyState = ConnectionStates.disconnected;
    await expect(service.check()).resolves.toEqual({
      status: 'error',
      mongo: 'down',
      redis: 'up',
    });
    expect(mongoPing).not.toHaveBeenCalled();
  });

  it('should report mongo down when the ping fails', async () => {
    mongoPing.mockRejectedValue(new Error('server selection timed out'));
    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      mongo: 'down',
    });
  });

  it('should report redis down when the ping fails', async () => {
    redisPing.mockRejectedValue(new Error('Redis client is not open'));
    await expect(service.check()).resolves.toEqual({
      status: 'error',
      mongo: 'up',
      redis: 'down',
    });
  });

  it('should report a store that does not answer in time as down', async () => {
    jest.useFakeTimers();
    redisPing.mockReturnValue(new Promise(() => undefined));
    const result = service.check();
    await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      status: 'error',
      mongo: 'up',
      redis: 'down',
    });
  });

  it('should never put error details in the report', async () => {
    mongoPing.mockRejectedValue(
      new Error('mongodb+srv://user:secret@cluster.example/veltra'),
    );
    const report = await service.check();
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(Object.keys(report).sort()).toEqual(['mongo', 'redis', 'status']);
  });

  describe('HealthController', () => {
    it('should return the report with 200 when everything is up', async () => {
      const controller = new HealthController(service);
      await expect(controller.check()).resolves.toEqual({
        status: 'ok',
        mongo: 'up',
        redis: 'up',
      });
    });

    it('should answer 503 with the same body when a store is down', async () => {
      redisPing.mockRejectedValue(new Error('down'));
      const controller = new HealthController(service);
      const error = await controller.check().then(
        () => null,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'error',
        mongo: 'up',
        redis: 'down',
      });
    });
  });
});
