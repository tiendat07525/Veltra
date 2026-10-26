import { readdirSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

// The only routes that may be reached without a JWT. Adding one needs a documented reason (security.md §1).
const PUBLIC_ROUTES = [
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
];

type Ctor = new (...args: never[]) => unknown;

const hasJwtGuard = (target: object) =>
  (
    (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ??
    []
  ).includes(JwtAuthGuard);

const joinPath = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

// Scan every controller file so controllers added later are checked too
const collectRoutes = () => {
  const srcDir = join(__dirname, '../src');
  const files = readdirSync(srcDir, {
    recursive: true,
    encoding: 'utf8',
  }).filter((f) => f.endsWith('.controller.ts'));
  const routes: { route: string; guarded: boolean }[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exports = require(join(srcDir, file)) as Record<string, unknown>;
    for (const value of Object.values(exports)) {
      if (typeof value !== 'function') continue;
      const ctrl = value as Ctor;
      const basePath = Reflect.getMetadata(PATH_METADATA, ctrl) as
        string | undefined;
      if (basePath === undefined) continue; // not a controller
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        // prototype.constructor is the class itself and carries the controller path
        if (name === 'constructor') continue;
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        if (path === undefined) continue; // not a route handler
        const method =
          RequestMethod[
            Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod
          ];
        routes.push({
          route: `${method} ${joinPath(basePath, path)}`,
          guarded: hasJwtGuard(ctrl) || hasJwtGuard(handler),
        });
      }
    }
  }
  return routes;
};

describe('Route guards (every route requires JwtAuthGuard unless allowlisted)', () => {
  const routes = collectRoutes();

  it('should discover the known controllers', () => {
    // Guards against a scan that silently finds nothing
    const found = routes.map((r) => r.route);
    expect(found).toEqual(
      expect.arrayContaining([
        'POST /auth/login',
        'GET /users/profile',
        'GET /friend',
        'GET /conversation',
        'POST /message/direct',
      ]),
    );
  });

  it('should protect every non-public route with JwtAuthGuard', () => {
    const unguarded = routes
      .filter((r) => !r.guarded && !PUBLIC_ROUTES.includes(r.route))
      .map((r) => r.route);
    expect(unguarded).toEqual([]);
  });

  it('should keep the public allowlist exact (no stale or guarded entries)', () => {
    const publicFound = routes
      .filter((r) => !r.guarded)
      .map((r) => r.route)
      .sort();
    expect(publicFound).toEqual([...PUBLIC_ROUTES].sort());
  });
});
