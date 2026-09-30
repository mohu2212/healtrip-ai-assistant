import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts', 'src/**/testing/**', 'src/main.ts'],
      reporter: ['text-summary', 'html'],
      // Enforced where a regression would be a safety problem: the agent loop and grounding,
      // the triage rules, and the tool layer. Controllers/modules are covered by the e2e suites.
      thresholds: {
        'src/agent/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/triage/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/tools/**': { lines: 95, branches: 85, functions: 95, statements: 95 },
      },
    },
  },
});
