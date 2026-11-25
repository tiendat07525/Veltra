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
      // Never gives up: 1 s, then doubling to 30 s (jitter by socket.io)
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
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

  // Skip the wait before socket.io's next attempt (back online, tab shown). No effect while connected.
  retryNow(): void {
    if (!this.socket || this.socket.connected || !getToken()) return;
    // connect() alone does nothing while socket.io waits between attempts
    this.socket.disconnect().connect();
  }

  // The server refused the handshake or closed the socket: socket.io does not retry by itself
  isGivenUp(): boolean {
    return !!this.socket && !this.socket.active;
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

  // Emit and wait for the server ack. Resolves null when not connected, on timeout or error.
  async emitWithAck<T = unknown>(event: string, payload?: unknown, timeoutMs = 5000): Promise<T | null> {
    const socket = this.socket;
    if (!socket?.connected) return null;
    try {
      const timed = socket.timeout(timeoutMs);
      return (await (payload === undefined
        ? timed.emitWithAck(event)
        : timed.emitWithAck(event, payload))) as T;
    } catch {
      return null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
export default socketService;
