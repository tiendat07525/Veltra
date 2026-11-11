import {
  getAllowedOrigins,
  isAllowedOrigin,
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
});
