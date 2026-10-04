import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  emitToUser(userId: string, event: string, data: any): void {
    if (!this.server) {
      this.logger.warn(
        `Không thể phát sự kiện '${event}': WebSocket server chưa được khởi tạo`,
      );
      return;
    }
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
