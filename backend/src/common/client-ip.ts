import type { IncomingHttpHeaders } from 'http';

// Same rule as Express `trust proxy 1` used for REST: the nearest proxy
// (Cloudflare Tunnel) appends the real client IP last in X-Forwarded-For
export const getSocketClientIp = (
  headers: IncomingHttpHeaders | undefined,
  address: string | undefined,
): string => {
  const forwarded = headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const last = raw
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  return last || address || 'unknown';
};
