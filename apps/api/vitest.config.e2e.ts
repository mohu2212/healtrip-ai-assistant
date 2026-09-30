import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Each test boots the full Nest app; allow headroom on loaded CI runners.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
