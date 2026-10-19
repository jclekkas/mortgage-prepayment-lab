import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test of a DEPLOYED preview (not a local build). Requires PREVIEW_URL, ending in
 * "/", e.g. https://jclekkas.github.io/mortgage-prepayment-lab/, and EXPECTED_COMMIT, the
 * full SHA the preview must have been built from.
 */
const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl || !previewUrl.endsWith('/')) throw new Error('Set PREVIEW_URL to the deployed site, ending in "/".');

export default defineConfig({
  testDir: 'tests/preview',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [['list']],
  use: { baseURL: previewUrl, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
