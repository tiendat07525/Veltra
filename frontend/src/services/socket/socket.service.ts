type SocketEventHandler = (...args: any[]) => void;

class SocketService {
  private listeners: Map<string, Set<SocketEventHandler>> = new Map();
  private connected: boolean = false;

  connect(url?: string, token?: string) {
    // When connecting to NestJS WebSocket Gateway (e.g. io(url, { auth: { token } }))
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(event: string, handler: SocketEventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: SocketEventHandler) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  emit(event: string, ...args: any[]) {
    // In actual Socket.IO: this.socket?.emit(event, ...args)
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((handler) => handler(...args));
    }
  }
}

export const socketService = new SocketService();
