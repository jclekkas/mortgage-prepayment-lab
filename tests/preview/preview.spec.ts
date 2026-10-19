/**
 * Runs against the hosted preview. URLs are relative ("./#/lab") so a sub-path such as
 * /mortgage-prepayment-lab/ is kept. Expected numbers are computed here from the engine
 * source, so the test proves the deployed bundle calculates what the tested code does.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { pct, usd } from '../../src/domain/format';
import { defaultScenario } from '../../src/domain/scenario';

const expectedCommit = process.env.EXPECTED_COMMIT ?? '';

function watch(page: Page) {
  const problems: string[] = [];
  const loaded: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
    else loaded.push(r.url());
  });
  return { problems, loaded };
}

test('the preview is the expected commit', async ({ request }) => {
  const res = await request.get('./build.json');
  expect(res.ok()).toBe(true);
  const build = await res.json();
  expect(build.commit).toBe(expectedCommit);
});

test('hosted preview: assets, calculation, deep links, export/import, no console errors', async ({ page }) => {
  const w = watch(page);
  await page.goto('./#/start');
  await expect(page.getByTestId('preview-note')).toContainText('Educational simulation with synthetic data');
  await page.getByTestId('preset-mixed').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
  await expect(page.getByTestId('build-commit')).toHaveText(expectedCommit.slice(0, 7));

  // App bundle and the calculation worker were served from the preview.
  expect(w.loaded.some((u) => /\/assets\/index-[^/]+\.js$/.test(u)), 'app bundle').toBe(true);
  expect(w.loaded.some((u) => /engine\.worker-[^/]+\.js$/.test(u)), 'worker bundle').toBe(true);

  // A scenario calculates correctly: the hosted numbers equal the engine run from source.
  const p = loadPreset('mixed');
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const shocked = runScenario(p, { ...base, ratePath: { ...base.ratePath, shockBps: -100 } }).summary;
  await page.goto('./#/lab');
  await page.getByTestId('ctl-shock').locator('input[type=number]').fill('-100');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date');
  await expect(page.getByTestId('kpi-cpr-value')).toHaveText(pct(shocked.nextMonthCpr));
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(usd(shocked.servicingNpv, { compact: true }));
  await expect(page.getByTestId('reconciliation')).toContainText('within tolerance');

  // Deep-link refresh.
  for (const r of ['validation', 'learn/speedometer', 'cohorts']) {
    await page.goto(`./#/${r}`);
    await page.reload();
    await expect(page.locator('h1').first()).not.toHaveText(/What would you like/);
  }

  // Export, then import the same file: every saved metric reproduces.
  await page.goto('./#/decision');
  await expect(page.getByTestId('export-json')).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  await page.getByTestId('import-input').setInputFiles({ name: 'scenarios.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced 2 of 2 saved results/);

  expect(w.problems, w.problems.join('\n')).toEqual([]);
});
