import { defineConfig } from 'vitest/config';

// Integration tests run against a real, seeded Postgres (TEST_DATABASE_URL); skipped when unset.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
  },
});
