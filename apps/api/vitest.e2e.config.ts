import { defineConfig } from 'vitest/config';

/** End-to-end: the real server on a port, the worker inline, a fake platform (P0-07b). Needs Postgres like integration. */
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    globalSetup: ['src/__tests__/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
