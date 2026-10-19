import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/numerics/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/perf/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
