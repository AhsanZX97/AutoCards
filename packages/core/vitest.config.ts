import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The Supabase Edge Functions keep their own copies of the plan limits and
    // model catalogue — Deno cannot import this package. Their tests run here,
    // from the one runner the repo has, so a drift between the two copies
    // fails the same `npm test` everything else does.
    include: ['src/**/__tests__/**/*.test.ts', '../../supabase/functions/**/__tests__/*.test.ts'],
  },
});
