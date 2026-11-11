const DEV_FRONTEND_ORIGIN = 'http://localhost:3000';

// Browser origins allowed by REST CORS and the Socket.IO gateway.
// Read on every call so values from .env (loaded by ConfigModule) are seen.
export const getAllowedOrigins = (
  env: NodeJS.ProcessEnv = process.env,
): string[] => {
  const origins: string[] = [];
  const frontendUrl = env.FRONTEND_URL?.trim().replace(/\/+$/, '');
  if (frontendUrl) origins.push(frontendUrl);
  if (env.NODE_ENV !== 'production' && !origins.includes(DEV_FRONTEND_ORIGIN)) {
    origins.push(DEV_FRONTEND_ORIGIN);
  }
  return origins;
};

// Requests without an Origin header (curl, server-to-server) are not CORS requests
export const isAllowedOrigin = (
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean => !origin || getAllowedOrigins(env).includes(origin);
