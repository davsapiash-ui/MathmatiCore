import base from './playwright.ux-audit.config';

export default {
  ...base,
  globalSetup: undefined,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' } },
    },
  ],
};
