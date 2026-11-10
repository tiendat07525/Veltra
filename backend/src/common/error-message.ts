// Readable message for logging a caught value of unknown type
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
