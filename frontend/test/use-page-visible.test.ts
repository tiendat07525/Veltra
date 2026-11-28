// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageVisible } from '@/hooks/use-page-visible';

const setVisibility = (state: 'visible' | 'hidden') =>
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  });

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('usePageVisible', () => {
  it('follows the page visibility', () => {
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
    setVisibility('hidden');
    expect(result.current).toBe(false);
    setVisibility('visible');
    expect(result.current).toBe(true);
  });
});
