import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Run test files sequentially to avoid DB state conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Load .env before any test runs
    env: {
      // Vitest reads from .env automatically when using dotenv integration
    },
    // Only run the test files we created (not the full workspace)
    include: ['src/tests/**/*.test.ts'],
    // Timeout for DB operations (integration tests)
    testTimeout: 30000,
  },
  resolve: {
    // Allow .js extension imports to resolve to .ts files (TS project with ESM)
    conditions: ['development', 'browser'],
  },
});
