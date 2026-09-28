import { defineConfig } from '@playwright/test';

/**
 * UX/UI audit of the student journey — its own configuration on purpose.
 *
 * The regular Playwright config runs `tests/global-setup.ts`, which seeds a
 * teacher, a school and a class into the LIVE Realtime Database. The audit
 * must never write to the live project: it blocks every request to Firebase
 * (see tests/ux-audit/harness.ts) and drives the student screens through the
 * dev-only store hooks instead. So: no global setup, a dedicated dev-server
 * port, and one worker (the measurements are per viewport and sequential).
 */
const PORT = Number(process.env.UX_AUDIT_PORT || 5174);

export default defineConfig({
  globalSetup: './tests/ux-audit/global-setup.ts',
  testDir: './tests/ux-audit',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // One test per viewport; the full scope is ~300 states, screenshots included.
  timeout: 90 * 60 * 1000,
  reporter: [['list']],
  outputDir: './test-results/ux-audit/playwright',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    video: 'off',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    actionTimeout: 15_000,
    navigationTimeout: 90_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
