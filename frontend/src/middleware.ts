import { NextResponse, type NextRequest } from 'next/server';
import { getApiBaseUrl, getSocketUrl } from '@/config/env';

// ws(s):// origin for the Socket.IO server (same host as its http(s) URL)
const toWsOrigin = (url: string) => new URL(url).origin.replace(/^http/, 'ws');

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === 'development';
  const apiOrigin = new URL(getApiBaseUrl()).origin;
  const socketUrl = getSocketUrl();

  const csp = [
    "default-src 'self'",
    // Next.js reads the nonce from this header and adds it to its own scripts
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // React inline style attributes (textarea height, image zoom)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin} ${new URL(socketUrl).origin} ${toWsOrigin(socketUrl)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Skip static assets and router prefetches
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
