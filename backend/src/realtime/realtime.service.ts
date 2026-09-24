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

  /**
   * Emit an event to a specific user's private room
   */
  emitToUser(userId: string, event: string, data: any): void {
    if (!this.server) {
      this.logger.warn(`Cannot emit event '${event}': WebSocket server not initialized`);
      return;
    }
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
