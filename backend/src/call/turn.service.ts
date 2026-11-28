import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorMessage } from '../common/error-message';
import {
  TURN_CREDENTIAL_TTL_S,
  TURN_REQUEST_TIMEOUT_MS,
} from './call.constants';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const NOT_CONFIGURED = 'Chức năng gọi chưa được cấu hình';
const UNAVAILABLE = 'Không thể kết nối máy chủ cuộc gọi, hãy thử lại';

// Browsers block port 53: a URL on it only times out (Cloudflare docs)
const isBlockedPort = (url: string) => /:53(\?|$)/.test(url);

/**
 * Short-lived TURN credentials from Cloudflare Realtime, one set per call party.
 * The key id / API token stay on the server; without them calls answer 503.
 */
@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!(this.keyId() && this.apiToken());
  }

  async iceServers(): Promise<IceServer[]> {
    const keyId = this.keyId();
    const token = this.apiToken();
    if (!keyId || !token) throw new ServiceUnavailableException(NOT_CONFIGURED);

    let body: unknown;
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_S }),
          signal: AbortSignal.timeout(TURN_REQUEST_TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err: unknown) {
      this.logger.warn(`[TURN] Cloudflare lỗi: ${errorMessage(err)}`);
      throw new ServiceUnavailableException(UNAVAILABLE);
    }

    const servers = TurnService.parse(body);
    if (servers.length === 0) {
      this.logger.warn('[TURN] Cloudflare trả về danh sách rỗng');
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
    return servers;
  }

  // Only the known fields; URLs as an array, port 53 dropped, entries left without URLs dropped
  static parse(body: unknown): IceServer[] {
    const list = (body as { iceServers?: unknown })?.iceServers;
    const entries = Array.isArray(list) ? list : list ? [list] : [];
    const servers: IceServer[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const { urls, username, credential } = entry as Record<string, unknown>;
      const all = (Array.isArray(urls) ? urls : [urls]).filter(
        (u): u is string => typeof u === 'string',
      );
      const usable = all.filter((u) => !isBlockedPort(u));
      if (usable.length === 0) continue;
      servers.push({
        urls: usable,
        ...(typeof username === 'string' ? { username } : {}),
        ...(typeof credential === 'string' ? { credential } : {}),
      });
    }
    return servers;
  }

  private keyId() {
    return this.configService.get<string>('CLOUDFLARE_TURN_KEY_ID')?.trim();
  }

  private apiToken() {
    return this.configService.get<string>('CLOUDFLARE_TURN_API_TOKEN')?.trim();
  }
}
