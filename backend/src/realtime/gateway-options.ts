import type { GatewayMetadata } from '@nestjs/websockets';
import { isAllowedOrigin } from 'src/common/allowed-origins';

// Every gateway (RealtimeGateway, CallGateway) shares one Socket.IO server with these options
export const GATEWAY_OPTIONS: GatewayMetadata = {
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`WebSocket CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  },
};
