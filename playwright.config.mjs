import { defineConfig, devices } from '@playwright/test';

const deployed = process.env.PLAYWRIGHT_DEPLOYED === '1';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 20000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'artifacts/diagnostics/playwright-results.json' }]],
  use: {
    baseURL: deployed ? undefined : 'http://127.0.0.1:4173',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: false,
  },
  webServer: deployed ? undefined : {
    command: 'node scripts/browser/static_server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true } },
  ],
});
