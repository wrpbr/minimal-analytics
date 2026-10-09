import { defineConfig } from 'vitest/config';

// Load the test configuration as ESM.
export default defineConfig({
  resolve: {
    alias: {
      '@minimal-analytics/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
