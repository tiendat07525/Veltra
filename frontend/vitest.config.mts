import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    // Hook tests opt in to a DOM with `// @vitest-environment happy-dom`
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
});
