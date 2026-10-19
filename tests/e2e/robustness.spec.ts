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
  // The generated file carries no saved results, so the reproduction check has nothing to compare.
  await expect(page.getByTestId('import-message')).toContainText('Imported. The file had no saved results to compare.', { timeout: 30_000 });
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

test('cancelling a 10,000-loan grid or sensitivity frees the worker immediately (D1)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await page.getByTestId('import-input').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: bigFile() });
  await page.goto('/#/lab');
  await expect(page.getByText('Ten thousand loans')).toBeVisible();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs', { timeout: 30_000 });

  // Grid: 25 full runs of 10,000 loans would occupy the worker for well over 5 s.
  await page.goto('/#/decision');
  await page.getByTestId('grid-run').click();
  await expect(page.getByRole('progressbar', { name: 'Grid progress' })).toBeVisible();
  await page.getByTestId('grid-cancel').click();
  await expect(page.getByTestId('grid-run')).toBeVisible();
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-shock', '-75');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs', { timeout: 5_000 });

  // Sensitivities: the panel now has its own progress bar and Cancel.
  await page.getByLabel('Role (changes detail level, not formulas)').selectOption('director');
  await page.getByTestId('sensitivity-run').click();
  await expect(page.getByRole('progressbar', { name: 'Sensitivity progress' })).toBeVisible();
  await page.getByTestId('sensitivity-cancel').click();
  await expect(page.getByTestId('sensitivity-run')).toBeVisible();
  await setNumber(page, 'ctl-shock', '-25');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs', { timeout: 5_000 });
});

test('the validation hypothesis survives navigation and reload (D2)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/validation');
  const text = 'Refinance response was higher than assumed; test on the 6-7% band.';
  await page.getByTestId('hypothesis').fill(text);
  await page.goto('/#/overview');
  await page.goto('/#/validation');
  await expect(page.getByTestId('hypothesis')).toHaveValue(text);
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.waitForTimeout(1200); // debounced save
  await page.reload();
  await expect(page.getByTestId('hypothesis')).toHaveValue(text);
});
