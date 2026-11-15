import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { errorMessage } from 'src/common/error-message';

export type RedisClient = ReturnType<typeof createClient>;

const maskRedisUrl = (redisUrl: string): string => {
  try {
    const parsed = new URL(redisUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return 'redis://[hidden]';
  }
};

/**
 * Socket.IO Redis adapter (pub/sub between backend instances) and its two Redis clients.
 * Without a URL, or when Redis cannot be reached, Socket.IO keeps its in-memory adapter.
 * Owned by RealtimeGateway (not a Nest provider).
 */
export class SocketRedisAdapter {
  private pubClient: RedisClient | null = null;
  private subClient: RedisClient | null = null;
  private active = false;
  private initializing = false;

  constructor(private readonly logger: Logger) {}

  async init(server: Server, redisUrl: string | undefined): Promise<void> {
    if (this.active || this.initializing) {
      this.logger.warn(
        'Socket.IO Redis adapter đã được khởi tạo hoặc đang trong quá trình khởi tạo',
      );
      return;
    }

    const url = redisUrl?.trim();
    if (!url) {
      this.active = false;
      this.logger.log(
        'REDIS_URL không được cấu hình; duy trì bộ điều hợp in-memory mặc định cho Socket.IO',
      );
      return;
    }

    this.initializing = true;
    try {
      this.logger.log(
        `Đang khởi tạo Socket.IO Redis adapter với URL: ${maskRedisUrl(url)}`,
      );

      const pubClient: RedisClient = createClient({ url });
      const subClient: RedisClient = pubClient.duplicate();

      pubClient.on('error', (err: unknown) => {
        this.logger.error(
          `Socket.IO Redis PubClient Error: ${errorMessage(err)}`,
        );
      });
      subClient.on('error', (err: unknown) => {
        this.logger.error(
          `Socket.IO Redis SubClient Error: ${errorMessage(err)}`,
        );
      });

      this.pubClient = pubClient;
      this.subClient = subClient;

      await Promise.all([pubClient.connect(), subClient.connect()]);

      server.adapter(createAdapter(pubClient, subClient));
      this.active = true;
      this.logger.log(
        'Socket.IO Redis adapter đã được khởi tạo và kết nối thành công',
      );
    } catch (err: unknown) {
      this.active = false;
      this.logger.error(
        `Không thể khởi tạo Socket.IO Redis adapter; chuyển về bộ điều hợp in-memory. Lỗi: ${errorMessage(err)}`,
      );
      await this.cleanup();
    } finally {
      this.initializing = false;
    }
  }

  async cleanup(): Promise<void> {
    const clients = [this.pubClient, this.subClient];
    this.pubClient = null;
    this.subClient = null;
    this.active = false;

    for (const client of clients) {
      if (client) {
        try {
          if (client.isOpen) {
            await client.quit();
          } else {
            try {
              await client.disconnect();
            } catch {
              // Client is already closed or destroyed
            }
          }
        } catch (err: unknown) {
          this.logger.warn(
            `Lỗi khi đóng Socket.IO Redis client: ${errorMessage(err)}`,
          );
        }
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  clients(): { pubClient: RedisClient | null; subClient: RedisClient | null } {
    return { pubClient: this.pubClient, subClient: this.subClient };
  }
}
