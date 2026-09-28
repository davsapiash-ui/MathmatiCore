import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  // The UX audit has its own config (playwright.ux-audit.config.ts): no live-DB
  // seeding, its own dev-server port, an hour-long matrix. `npm run ux-audit`.
  testIgnore: ['**/ux-audit/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
