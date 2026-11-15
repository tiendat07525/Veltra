import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

type Ctor = new (...args: never[]) => unknown;

const srcDir = join(__dirname, '../src');

// HTTP methods used by every controller route (scanned, so new controllers are checked too)
const collectRouteMethods = () => {
  const files = readdirSync(srcDir, {
    recursive: true,
    encoding: 'utf8',
  }).filter((f) => f.endsWith('.controller.ts'));
  const methods = new Set<string>();
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exports = require(join(srcDir, file)) as Record<string, unknown>;
    for (const value of Object.values(exports)) {
      if (typeof value !== 'function') continue;
      const ctrl = value as Ctor;
      if (Reflect.getMetadata(PATH_METADATA, ctrl) === undefined) continue;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        if (name === 'constructor') continue;
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        methods.add(
          RequestMethod[
            Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod
          ],
        );
      }
    }
  }
  return methods;
};

// The `methods` list passed to app.enableCors in main.ts (main.ts boots the app on import,
// so it is read as text)
const corsMethods = () => {
  const main = readFileSync(join(srcDir, 'main.ts'), 'utf8');
  const match = /enableCors\(\{[\s\S]*?methods:\s*\[([^\]]*)\]/.exec(main);
  if (!match) throw new Error('enableCors methods not found in main.ts');
  return [...match[1].matchAll(/'([A-Z]+)'/g)].map((m) => m[1]);
};

describe('CORS methods (browsers can call every REST route)', () => {
  it('should find the route methods in use, PUT included', () => {
    expect([...collectRouteMethods()]).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    );
  });

  it('should allow every method a controller uses', () => {
    const allowed = corsMethods();
    const missing = [...collectRouteMethods()].filter(
      (m) => !allowed.includes(m),
    );
    expect(missing).toEqual([]);
  });
});
