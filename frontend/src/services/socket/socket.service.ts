import { io, Socket } from 'socket.io-client';

type SocketEventHandler = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private currentToken: string | null = null;

  /**
   * Connect to Socket.IO server with JWT token.
   * Ensures single instance per session and prevents duplicate connections.
   */
  connect(url?: string, token?: string): Socket | null {
    if (typeof window === 'undefined') return null;

    const authToken = token || localStorage.getItem('accessToken');
    if (!authToken) {
      return null;
    }

    const socketUrl =
      url ||
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API ||
      'http://localhost:4000';

    // If socket already exists with the same token and is connected or connecting, reuse it
    if (this.socket && this.currentToken === authToken) {
      if (this.socket.connected) {
        return this.socket;
      }
      // Reconnect if disconnected
      this.socket.connect();
      return this.socket;
    }

    // Clean up previous socket if token changed
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

  /**
   * Disconnect and cleanup socket instance upon user logout or session termination
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  /**
   * Register an event listener
   */
  on(event: string, handler: SocketEventHandler): void {
    this.socket?.on(event, handler);
  }

  /**
   * Remove an event listener
   */
  off(event: string, handler?: SocketEventHandler): void {
    if (handler) {
      this.socket?.off(event, handler);
    } else {
      this.socket?.off(event);
    }
  }

  /**
   * Emit an event
   */
  emit(event: string, ...args: any[]): void {
    this.socket?.emit(event, ...args);
  }

  /**
   * Return the underlying Socket instance if needed
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
export default socketService;
