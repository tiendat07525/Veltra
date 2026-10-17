import { io, Socket } from 'socket.io-client';
import { getToken } from '../api/api';
import { getSocketUrl } from '@/config/env';

type SocketEventHandler<T = unknown> = (payload: T) => void;

class SocketService {
  private socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(url?: string, token?: string): Socket | null {
    if (typeof window === 'undefined') return null;

    const authToken = token || getToken();
    if (!authToken) {
      return null;
    }

    const socketUrl = url || getSocketUrl();
    if (this.socket && this.currentToken === authToken) {
      if (this.socket.connected) {
        return this.socket;
      }
      this.socket.connect();
      return this.socket;
    }
    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = authToken;
    this.socket = io(socketUrl, {
      auth: {
        token: authToken,
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  on<T = unknown>(event: string, handler: SocketEventHandler<T>): void {
    this.socket?.on(event, handler as (...args: unknown[]) => void);
  }

  off<T = unknown>(event: string, handler?: SocketEventHandler<T>): void {
    if (handler) {
      this.socket?.off(event, handler as (...args: unknown[]) => void);
    } else {
      this.socket?.off(event);
    }
  }

  emit(event: string, ...args: unknown[]): void {
    this.socket?.emit(event, ...args);
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
export default socketService;
