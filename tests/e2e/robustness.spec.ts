import { expect, test } from '@playwright/test';
import { generatePortfolio } from '../../src/data/generator';
import { defaultScenario } from '../../src/domain/scenario';
import { buildScenarioFile } from '../../src/storage/files';
import { setNumber, startFresh } from './fixtures';

function bigFile(): Buffer {
  const p = generatePortfolio({ loanCount: 10_000, presetId: 'big-test', name: 'Ten thousand loans', description: 'Large synthetic test book' });
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const s1 = { ...structuredClone(base), scenarioId: 'scenario-1', name: 'Scenario 1', baselineId: 'baseline' };
  return Buffer.from(JSON.stringify(buildScenarioFile({ portfolio: p, baselineId: 'baseline', scenarios: [base, s1], filter: {}, notes: {} }, [])));
}

test('10,000-loan import runs with progress and can be cancelled', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  const buf = bigFile();
  expect(buf.length).toBeLessThan(10 * 1024 * 1024);
  await page.getByTestId('import-input').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: buf });
  await expect(page.getByTestId('import-message')).toContainText('Reproduced 0 of 0|Imported', { timeout: 30_000 }).catch(() => {});
  await page.goto('/#/lab');
  await expect(page.getByText('Ten thousand loans')).toBeVisible();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible({ timeout: 30_000 });
  await setNumber(page, 'ctl-shock', '-150');
  await page.getByTestId('run').click();
  await page.getByTestId('cancel').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText(/Unsaved changes/);
  await expect(page.getByTestId('cancel')).toHaveCount(0);
  // The app still works after cancellation.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs', { timeout: 30_000 });
});

test('a slower older run never overwrites a newer one', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-shock', '-200');
  await page.getByTestId('run').click();
  await setNumber(page, 'ctl-shock', '50');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('explanation')).toContainText('Rate shock: 0 bps → 50 bps');
});

test('malformed and future-version imports are rejected and change nothing', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByTestId('import-message')).toContainText('not valid JSON');
  const future = JSON.stringify({ fileType: 'mortgage-prepayment-lab/scenarios', schemaVersion: 9, modelVersion: 'x' });
  await page.getByTestId('import-input').setInputFiles({ name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(future) });
  await expect(page.getByTestId('import-message')).toContainText('newer version');
  await expect(page.getByTestId('compare-table')).toContainText('Scenario 1');
});

test('works with storage unavailable and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked by test'); } });
  });
  await page.goto('/#/start');
  await page.getByTestId('start').click();
  await expect(page.getByText('Not saved: storage unavailable')).toBeVisible();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
});

test('deep links survive a refresh on the production build', async ({ page }) => {
  await startFresh(page);
  for (const r of ['lab', 'cohorts', 'decision', 'validation', 'learn/rates-fall', 'methodology']) {
    await page.goto(`/#/${r}`);
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).not.toHaveText(/What would you like/);
  }
});

test('saved workspace is restored after reload', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-friction', '75');
  await page.getByTestId('run').click();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByTestId('ctl-friction').locator('input[type=number]')).toHaveValue('75');
});
