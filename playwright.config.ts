import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 4,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: 'linux',
      use: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    },
    {
      name: 'desktop',
      testMatch: /(?:focus-clickthrough|user-flows)\.spec\.ts/,
      use: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    },
    {
      name: 'macos',
      testMatch: /(?:focus-clickthrough|user-flows)\.spec\.ts/,
      use: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    },
  ],
  webServer: {
    command: 'npx serve dist -l 4173 --no-clipboard',
    url: 'http://localhost:4173/game/',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
