import { ForbiddenException } from '@nestjs/common';
import {
  getAllowedOrigins,
  isAllowedOrigin,
  restCorsOrigin,
} from '../src/common/allowed-origins';

describe('allowed origins', () => {
  const prod = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://tiendat75.id.vn',
  };

  it('should only allow FRONTEND_URL in production', () => {
    expect(getAllowedOrigins(prod)).toEqual(['https://tiendat75.id.vn']);
    expect(isAllowedOrigin('https://tiendat75.id.vn', prod)).toBe(true);
    expect(isAllowedOrigin('http://tiendat75.id.vn', prod)).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000', prod)).toBe(false);
    expect(isAllowedOrigin('https://evil.example', prod)).toBe(false);
  });

  it('should also allow localhost:3000 outside production', () => {
    const dev = { NODE_ENV: 'development', FRONTEND_URL: 'https://a.test' };

    expect(getAllowedOrigins(dev)).toEqual([
      'https://a.test',
      'http://localhost:3000',
    ]);
    expect(getAllowedOrigins({})).toEqual(['http://localhost:3000']);
    expect(
      getAllowedOrigins({ FRONTEND_URL: 'http://localhost:3000' }),
    ).toEqual(['http://localhost:3000']);
  });

  it('should ignore surrounding spaces and trailing slashes in FRONTEND_URL', () => {
    const env = {
      NODE_ENV: 'production',
      FRONTEND_URL: ' https://tiendat75.id.vn/ ',
    };

    expect(isAllowedOrigin('https://tiendat75.id.vn', env)).toBe(true);
  });

  it('should block every browser origin in production without FRONTEND_URL', () => {
    const env = { NODE_ENV: 'production' };

    expect(getAllowedOrigins(env)).toEqual([]);
    expect(isAllowedOrigin('https://tiendat75.id.vn', env)).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000', env)).toBe(false);
  });

  it('should allow requests without an Origin header', () => {
    expect(isAllowedOrigin(undefined, prod)).toBe(true);
  });

  describe('restCorsOrigin', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, ...prod };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should allow a configured origin', () => {
      const callback = jest.fn();

      restCorsOrigin('https://tiendat75.id.vn', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject a disallowed origin with 403 instead of a generic error (500)', () => {
      const callback = jest.fn();

      restCorsOrigin('https://evil.example', callback);

      const [err] = callback.mock.calls[0] as [unknown];
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });
  });
});
