// MongoDB duplicate-key error (E11000), e.g. two requests racing on a unique index
export const isDuplicateKeyError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return (
    code === 11000 ||
    (typeof message === 'string' && message.includes('E11000'))
  );
};
