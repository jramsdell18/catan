import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Only Playwright specs; skip Vitest (*.test.js) and node:test board-rules tests
  testMatch: '**/*.spec.js',
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    // Prefer a fresh server in CI; allow reuse locally when already on this worktree.
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
