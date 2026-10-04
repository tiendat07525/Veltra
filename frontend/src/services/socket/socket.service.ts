import { io, Socket } from 'socket.io-client';

type SocketEventHandler = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private currentToken: string | null = null;

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


  on(event: string, handler: SocketEventHandler): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: SocketEventHandler): void {
    if (handler) {
      this.socket?.off(event, handler);
    } else {
      this.socket?.off(event);
    }
  }

  emit(event: string, ...args: any[]): void {
    this.socket?.emit(event, ...args);
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
export default socketService;
