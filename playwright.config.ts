import { defineConfig, devices } from '@playwright/test';

// CHROMIUM_PATH points at a pre-installed Chromium (e.g. a sandbox without browser
// downloads); otherwise Playwright's own managed browsers are used. Run one engine with
// --project=chromium. CI installs Chromium and WebKit (Safari's engine) and runs all projects.
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Safari on a phone-sized screen: the core journey only.
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'] }, testMatch: ['walkthrough.spec.ts'] },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
