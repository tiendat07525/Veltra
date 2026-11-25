// Text to show for a failed API call: the server's message (the first one of a list), else fallback
export function apiErrorText(err: unknown, fallback: string): string {
  const response = (err as {
    response?: { status?: number; data?: { message?: string | string[] } };
  })?.response;
  const raw = response?.data?.message;
  const message = Array.isArray(raw) ? raw[0] : raw;
  // The per-IP limiter answers in English ("ThrottlerException: ..."); its window is one minute.
  // Any other 429 (too many wrong passwords / codes) says itself how long to wait.
  if (response?.status === 429 && (!message || message.startsWith('ThrottlerException'))) {
    return 'Thử lại quá nhiều lần, vui lòng đợi một phút';
  }
  return typeof message === 'string' && message ? message : fallback;
}
