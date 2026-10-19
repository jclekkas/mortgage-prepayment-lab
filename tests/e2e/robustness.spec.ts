import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { generatePortfolio, type GeneratorConfig } from '../../src/data/generator';
import { defaultScenario } from '../../src/domain/scenario';
import { buildScenarioFile } from '../../src/storage/files';
import { setNumber, startFresh } from './fixtures';

function bigFile(config: Partial<GeneratorConfig> = {}): Buffer {
  const p = generatePortfolio({ loanCount: 10_000, presetId: 'big-test', name: 'Ten thousand loans', description: 'Large synthetic test book', ...config });
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
  // Click Run, then Cancel as soon as React renders it, inside the page. Clicking Cancel
  // through Playwright waits for the button to be stable, which on a slow-rendering browser
  // can outlast the run itself; the worker checks for cancellation between 250-loan chunks.
  const cancelled = await page.evaluate(async () => {
    (document.querySelector('[data-testid=run]') as HTMLButtonElement).click();
    for (let i = 0; i < 500; i++) {
      const c = document.querySelector('[data-testid=cancel]') as HTMLButtonElement | null;
      if (c) {
        c.click();
        return true;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return false;
  });
  expect(cancelled, 'the Cancel button appeared while the run was in progress').toBe(true);
  await expect(page.getByTestId('dirty-badge')).toHaveText(/Edited: press Run/);
  await expect(page.getByTestId('cancel')).toHaveCount(0);
  // The app still works after cancellation.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 30_000 });
});

test('a slower older run never overwrites a newer one', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-shock', '-200');
  await page.getByTestId('run').click();
  await setNumber(page, 'ctl-shock', '50');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('explanation')).toContainText('Rate shock: 0 basis points → 50 basis points');
});

test('malformed and future-version imports are rejected and change nothing', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByTestId('import-message')).toContainText('not valid JavaScript Object Notation');
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
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByTestId('ctl-friction').locator('input[type=number]')).toHaveValue('75');
});

test('cancelling a 10,000-loan grid or sensitivity frees the worker immediately (D1)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await page.getByTestId('import-input').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: bigFile() });
  await expect(page.getByTestId('import-message')).toContainText('Imported', { timeout: 30_000 });
  await page.goto('/#/lab');
  await expect(page.getByText('Ten thousand loans')).toBeVisible();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 30_000 });

  // Grid: 25 full runs of 10,000 loans would occupy the worker for well over 5 s.
  await page.goto('/#/decision');
  await page.getByTestId('grid-run').click();
  await expect(page.getByRole('progressbar', { name: 'Grid progress' })).toBeVisible();
  await page.getByTestId('grid-cancel').click();
  await expect(page.getByTestId('grid-run')).toBeVisible();
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-shock', '-75');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 5_000 });

  // Sensitivities: the panel now has its own progress bar and Cancel.
  await page.getByLabel('Role (changes detail level, not formulas)').selectOption('director');
  await page.getByTestId('sensitivity-run').click();
  await expect(page.getByRole('progressbar', { name: 'Sensitivity progress' })).toBeVisible();
  await page.getByTestId('sensitivity-cancel').click();
  await expect(page.getByTestId('sensitivity-run')).toBeVisible();
  await setNumber(page, 'ctl-shock', '-25');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 5_000 });
});

test('the validation hypothesis survives navigation and reload (D2)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/validation');
  const text = 'Refinance response was higher than assumed; test on the 6-7% band.';
  await page.getByTestId('hypothesis').fill(text);
  await page.goto('/#/overview');
  await page.goto('/#/validation');
  await expect(page.getByTestId('hypothesis')).toHaveValue(text);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.waitForTimeout(1200); // debounced save
  await page.reload();
  await expect(page.getByTestId('hypothesis')).toHaveValue(text);
});

test('REGRESSION: after a filter change, a cancelled recalculation is never compared, printed or exported (issue 1)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  // All high-coupon loans, so filtering to 7%+ keeps about three quarters of 10,000 loans:
  // each recalculation takes long enough to cancel.
  await page.getByTestId('import-input').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: bigFile({ cohortWeights: [0, 0, 1] }) });
  // Wait for the import to replace the workspace before acting on it.
  await expect(page.getByTestId('import-message')).toContainText('Imported', { timeout: 30_000 });
  await page.goto('/#/lab');
  await expect(page.getByText('Ten thousand loans')).toBeVisible();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 30_000 });

  await page.goto('/#/cohorts');
  await page.getByTestId('filter-coupon-ge7').check();
  await page.getByTestId('status-cancel').click(); // cancel Scenario 1's recalculation for the new population
  await expect(page.getByTestId('run-status')).toContainText('Calculation cancelled.');
  await expect(page.getByTestId('run-status')).toContainText('not shown, compared or exported');
  await expect(page.getByTestId('results-blocked')).toBeVisible(); // cohort table withheld

  // Decision room: the baseline recalculates; Scenario 1 keeps only an old-population result.
  await page.goto('/#/decision');
  const blocked = page.getByTestId('comparison-blocked');
  await expect(blocked).toContainText('Scenario 1: The recalculation was cancelled', { timeout: 30_000 });
  await expect(blocked).not.toContainText('Baseline:', { timeout: 30_000 });
  await expect(page.getByTestId('compare-table')).toContainText('Not compared: different population');
  await expect(page.getByTestId('export-json')).toBeDisabled();
  await expect(page.getByTestId('open-brief')).toBeDisabled();
  await expect(page.getByTestId('excluded-results')).toContainText('Scenario 1');

  // The brief cannot be printed, even by direct link.
  await page.goto('/#/brief');
  await expect(page.getByTestId('brief-blocked')).toContainText('Scenario 1');
  await expect(page.getByRole('button', { name: 'Print or save this brief' })).toBeDisabled();

  // The lab shows no ledger or CSV export for the retained result.
  await page.goto('/#/lab');
  await expect(page.getByTestId('no-current-result')).toBeVisible();
  await expect(page.getByTestId('export-csv')).toHaveCount(0);
  await expect(page.getByTestId('excluded-results')).toContainText('Scenario 1');

  // Running Scenario 1 for the new population restores everything.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results are up to date', { timeout: 30_000 });
  await expect(page.getByTestId('export-csv')).toBeVisible();
  await page.goto('/#/decision');
  await expect(page.getByTestId('comparison-blocked')).toHaveCount(0);
  await expect(page.getByTestId('export-json')).toBeEnabled();
});

test('REGRESSION: an import whose saved prepaid12 was altered does not verify (issue 3)', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await expect(page.getByTestId('export-json')).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const f = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  const npv = f.results[1].summary.servicingNpv;
  f.results[1].summary.prepaid12 += 1000; // NPV and run key untouched
  await page.getByTestId('import-input').setInputFiles({ name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f)) });
  const msg = page.getByTestId('import-message');
  await expect(msg).toContainText('Did not reproduce: 1 of 2 saved results differ');
  await expect(msg).toContainText('Scenario 1: prepaid12 saved');
  await expect(msg).not.toContainText('servicingNpv');
  expect(f.results[1].summary.servicingNpv).toBe(npv);
});
