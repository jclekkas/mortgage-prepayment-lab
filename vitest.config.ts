import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __BUILD_COMMIT__: JSON.stringify('test'), __BUILD_TIME__: JSON.stringify('test') },
  test: {
    include: ['tests/numerics/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/perf/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
