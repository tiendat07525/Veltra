import { getApiBaseUrl, getSocketUrl } from '../../frontend/src/config/env';

describe('Frontend API URL Configuration (FULLAUDIT-009)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API;
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use canonical NEXT_PUBLIC_API_URL when set', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.veltra.example.com';
    process.env.NEXT_PUBLIC_API = 'https://legacy.veltra.example.com';

    expect(getApiBaseUrl()).toBe('https://api.veltra.example.com');
  });

  it('should fall back to legacy NEXT_PUBLIC_API when canonical variable is missing', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API = 'https://legacy.veltra.example.com';

    expect(getApiBaseUrl()).toBe('https://legacy.veltra.example.com');
  });

  it('should default to http://localhost:4000 when neither variable is set', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API;

    expect(getApiBaseUrl()).toBe('http://localhost:4000');
  });

  it('should trim whitespace and strip trailing slashes to prevent // path duplication', () => {
    process.env.NEXT_PUBLIC_API_URL = '  https://api.veltra.example.com///  ';

    expect(getApiBaseUrl()).toBe('https://api.veltra.example.com');
  });

  it('should resolve getSocketUrl using NEXT_PUBLIC_SOCKET_URL if provided', () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = 'wss://socket.veltra.example.com/';

    expect(getSocketUrl()).toBe('wss://socket.veltra.example.com');
  });

  it('should fall back getSocketUrl to getApiBaseUrl when NEXT_PUBLIC_SOCKET_URL is missing', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.veltra.example.com';

    expect(getSocketUrl()).toBe('https://api.veltra.example.com');
  });
});
