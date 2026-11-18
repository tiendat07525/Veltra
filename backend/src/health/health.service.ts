import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { SessionService } from 'src/auth/session.service';

export const HEALTH_CHECK_TIMEOUT_MS = 2000;

export type DependencyState = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  mongo: DependencyState;
  redis: DependencyState;
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });

/**
 * Liveness of the two stores every request depends on. Failures are logged here and never
 * returned to the caller (GET /health is public).
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly sessionService: SessionService,
  ) {}

  async check(): Promise<HealthReport> {
    const [mongo, redis] = await Promise.all([
      this.probe('MongoDB', () => this.pingMongo()),
      this.probe('Redis', () => this.sessionService.ping()),
    ]);
    return {
      status: mongo === 'up' && redis === 'up' ? 'ok' : 'error',
      mongo,
      redis,
    };
  }

  private async pingMongo(): Promise<void> {
    if (
      this.connection.readyState !== ConnectionStates.connected ||
      !this.connection.db
    ) {
      throw new Error(
        `not connected (readyState ${this.connection.readyState})`,
      );
    }
    await this.connection.db.admin().ping();
  }

  private async probe(
    name: string,
    run: () => Promise<void>,
  ): Promise<DependencyState> {
    try {
      await withTimeout(run(), HEALTH_CHECK_TIMEOUT_MS);
      return 'up';
    } catch (err: unknown) {
      this.logger.warn(
        `[Health] ${name} down: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'down';
    }
  }
}
