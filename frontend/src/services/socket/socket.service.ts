import { io, Socket } from 'socket.io-client';
import { getToken } from '../api/api';
import { getSocketUrl } from '@/config/env';

type SocketEventHandler<T = unknown> = (payload: T) => void;
type RawHandler = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  // Handlers survive socket re-creation and may be registered before the socket exists
  private handlers = new Map<string, Set<RawHandler>>();

  connect(url?: string): Socket | null {
    if (typeof window === 'undefined') return null;
    if (!getToken()) return null;

    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    const socket = io(url || getSocketUrl(), {
      // Evaluated on every (re)connect attempt, so a reconnect always sends the current access token
      auth: (cb) => cb({ token: getToken() }),
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    this.handlers.forEach((eventHandlers, event) => {
      eventHandlers.forEach((handler) => socket.on(event, handler));
    });
    this.socket = socket;
    return socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  on<T = unknown>(event: string, handler: SocketEventHandler<T>): void {
    const raw = handler as RawHandler;
    let eventHandlers = this.handlers.get(event);
    if (!eventHandlers) {
      eventHandlers = new Set();
      this.handlers.set(event, eventHandlers);
    }
    eventHandlers.add(raw);
    this.socket?.on(event, raw);
  }

  off<T = unknown>(event: string, handler?: SocketEventHandler<T>): void {
    if (handler) {
      const raw = handler as RawHandler;
      this.handlers.get(event)?.delete(raw);
      this.socket?.off(event, raw);
    } else {
      this.handlers.delete(event);
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
