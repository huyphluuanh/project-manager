import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: '"test"' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
