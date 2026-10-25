/**
 * Resolves the canonical backend API base URL for REST requests.
 * Canonical variable: NEXT_PUBLIC_API_URL
 * Backwards-compatibility fallback: NEXT_PUBLIC_API
 * Development fallback: http://localhost:4000
 */
export function getApiBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API;

  if (!envUrl) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Config Warning] Neither NEXT_PUBLIC_API_URL nor NEXT_PUBLIC_API is configured in production. Falling back to default: http://localhost:4000',
      );
    }
    return 'http://localhost:4000';
  }

  // Normalize: Trim whitespace and strip trailing slashes to prevent double slashes (e.g. //auth/refresh)
  const trimmed = envUrl.trim().replace(/\/+$/, '');

  try {
    // Validate that the string is a parseable URL
    new URL(trimmed);
  } catch {
    console.error(
      `[Config Error] Malformed API URL configured in environment: "${trimmed}". Please provide a valid HTTP/HTTPS URL for NEXT_PUBLIC_API_URL.`,
    );
  }

  return trimmed;
}

/**
 * Resolves the WebSocket server URL.
 * Falls back to NEXT_PUBLIC_SOCKET_URL or getApiBaseUrl().
 */
export function getSocketUrl(): string {
  const explicitSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (explicitSocketUrl) {
    return explicitSocketUrl.trim().replace(/\/+$/, '');
  }
  return getApiBaseUrl();
}
