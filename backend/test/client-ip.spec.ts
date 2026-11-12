import { getSocketClientIp } from '../src/common/client-ip';

describe('getSocketClientIp', () => {
  it('should take the last X-Forwarded-For entry (added by the nearest proxy)', () => {
    expect(
      getSocketClientIp(
        { 'x-forwarded-for': '10.0.0.9, 203.0.113.7' },
        '127.0.0.1',
      ),
    ).toBe('203.0.113.7');
  });

  it('should handle X-Forwarded-For given as an array', () => {
    expect(
      getSocketClientIp(
        { 'x-forwarded-for': ['10.0.0.9', '198.51.100.4 '] as any },
        '127.0.0.1',
      ),
    ).toBe('198.51.100.4');
  });

  it('should fall back to the socket address without X-Forwarded-For', () => {
    expect(getSocketClientIp({}, '127.0.0.1')).toBe('127.0.0.1');
    expect(getSocketClientIp({ 'x-forwarded-for': ' , ' }, '::1')).toBe('::1');
  });

  it('should return "unknown" when nothing identifies the client', () => {
    expect(getSocketClientIp(undefined, undefined)).toBe('unknown');
  });
});
