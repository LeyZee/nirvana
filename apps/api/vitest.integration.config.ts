import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts', 'test/**/*.integration.test.ts'],
    globalSetup: ['src/__tests__/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
