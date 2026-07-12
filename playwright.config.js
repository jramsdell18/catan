import { defineConfig } from '@playwright/test';

const port = process.env.CATAN_TEST_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  // Only Playwright specs; skip Vitest (*.test.js) and node:test board-rules tests
  testMatch: '**/*.spec.js',
  use: {
    baseURL,
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    // Fresh server in CI or when CATAN_TEST_PORT forces an isolated port.
    reuseExistingServer: !process.env.CI && !process.env.CATAN_TEST_PORT,
    timeout: 120000,
  },
});
