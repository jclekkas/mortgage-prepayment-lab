import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTab, selectScenario, setNumber, startFresh } from './fixtures';

test('core loop: preset, shock, run, inspect, filter, compare, lesson, export, import, reproduce', async ({ page }) => {
  await startFresh(page);
  const baseNpv = await page.getByTestId('kpi-npv-value').textContent();

  // Lab: shock rates on Scenario 1 and run.
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-shock', '-100');
  await expect(page.getByTestId('dirty-badge')).toHaveText(/edited, press Run/);
  // Before Run: nothing may present the old results as reflecting the edit.
  await expect(page.getByTestId('run-status')).toContainText('Previous run.');
  await expect(page.getByTestId('run-status')).toContainText('Rate shock: 0 basis points → -100 basis points');
  await expect(page.getByTestId('kpi-stale').first()).toBeVisible();
  await expect(page.getByTestId('explanation-stale')).toContainText('not yet run');
  await expect(page.getByTestId('explanation-headline')).toContainText('When last run');
  await expect(page.getByTestId('charts-stale')).toBeVisible();
  await openTab(page, 'ledger');
  await expect(page.getByTestId('export-csv')).toBeDisabled();
  await expect(page.getByTestId('export-csv-paused')).toBeVisible();
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(baseNpv!);
  await expect(page.getByTestId('same-as-baseline')).toBeVisible();
  await expect(page.getByTestId('kpi-cpr').getByTestId('trend')).toHaveCount(0);
  // Other screens: previous-run results are labeled, and nothing exports edits next to old results.
  await page.goto('/#/cohorts');
  await expect(page.getByTestId('cohort-table').locator('caption')).toContainText('previous run; edits not yet run');
  await page.goto('/#/decision');
  await expect(page.getByTestId('edits-unrun')).toContainText('Brief and export are paused');
  await expect(page.getByTestId('compare-table')).toContainText('Previous run');
  await openTab(page, 'files');
  await expect(page.getByTestId('export-json')).toBeDisabled();
  await expect(page.getByTestId('open-brief')).toBeDisabled();
  await page.goto('/#/brief');
  await expect(page.getByTestId('brief-blocked')).toContainText('edited but not run');
  await page.goto('/#/lab');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await expect(page.getByTestId('explanation-headline')).toContainText('lower-rate assumption');
  // After Run: every previous-run marker is gone.
  await expect(page.getByTestId('kpi-stale')).toHaveCount(0);
  await expect(page.getByTestId('explanation-stale')).toHaveCount(0);
  await expect(page.getByTestId('charts-stale')).toHaveCount(0);
  const shockNpv = await page.getByTestId('kpi-npv-value').textContent();
  expect(shockNpv).not.toBe(baseNpv);
  // Arrows: prepayment speed shows direction only; servicing value is judged on its own number.
  const cprTrend = page.getByTestId('kpi-cpr').getByTestId('trend');
  await expect(cprTrend).toHaveAttribute('data-direction', 'up');
  await expect(cprTrend).toHaveAttribute('data-tone', 'neutral');
  await expect(cprTrend).toContainText('faster');
  await expect(cprTrend).not.toContainText('worse');
  const npvTrend = page.getByTestId('kpi-npv').getByTestId('trend');
  await expect(npvTrend).toHaveAttribute('data-direction', 'down');
  await expect(npvTrend).toContainText('lower');
  // Switching perspective changes the cards, the details panel and the explanation together.
  await page.getByTestId('perspective-owner').click();
  await expect(page.getByTestId('kpi-section')).toHaveAttribute('data-perspective', 'owner');
  await expect(page.getByTestId('kpi-npv')).toHaveCount(0);
  await expect(page.getByTestId('kpi-ownerInterest12')).toBeVisible();
  await expect(page.getByTestId('kpi-section')).toContainText('does not calculate the investment’s value, yield or profit');
  await expect(page.getByTestId('detail-perspective')).toContainText('loan owner');
  await expect(page.getByTestId('investor-panel')).toBeVisible();
  await page.getByTestId('perspective-servicer').click();
  await expect(page.getByTestId('kpi-npv')).toBeVisible();
  // The balance owed is stated once, in the headline line: no assumption changes it.
  await expect(page.getByTestId('balance-line')).toContainText('Balance still owed: $331.72M');
  await expect(page.getByTestId('balance-line')).toContainText('No assumption changes it');

  // Inspect a month via the ledger; reconciliation must pass.
  await openTab(page, 'ledger');
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByTestId('month-ledger')).toContainText('month 2');
  await expect(page.getByTestId('reconciliation')).toContainText('within tolerance');

  // Freeze the shocked scenario as baseline, then restore by viewing it.
  await page.getByTestId('freeze').click();
  await selectScenario(page, 1);
  await expect(page.getByTestId('scenario-tab-1')).toContainText('Baseline (from Scenario 1)');
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(shockNpv!);
  await selectScenario(page, 2);

  // Filter a cohort: population badge updates everywhere.
  await page.goto('/#/cohorts');
  await page.getByTestId('filter-coupon-ge7').check();
  await expect(page.getByTestId('population-badge')).toContainText('(filtered)');
  await page.goto('/#/overview');
  await expect(page.getByTestId('population-badge')).toContainText('(filtered)');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('population-badge')).toContainText('all 1,000 loans');

  // Compare in the decision room.
  await page.goto('/#/decision');
  await expect(page.getByTestId('compare-table')).toContainText('Illustrative servicing net present value (NPV)');
  await openTab(page, 'files');

  // Export JSON, then import it and confirm results reproduce.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const path = await download.path();
  const text = readFileSync(path!, 'utf8');
  expect(JSON.parse(text).fileType).toBe('mortgage-prepayment-lab/scenarios');
  await page.getByTestId('import-input').setInputFiles({ name: 'scenarios.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced (\d+) of \1 saved results: run keys, input hashes and all \d+ summary metrics match/);

  // CSV export has no NaN/Infinity.
  await page.goto('/#/lab');
  await openTab(page, 'ledger');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  const csvText = readFileSync((await csv.path())!, 'utf8');
  expect(csvText).not.toMatch(/NaN|Infinity/);

  // Finish an exercise.
  await page.goto('/#/learn/speedometer');
  await page.getByLabel('About 0.514%').check();
  await page.getByTestId('check-prediction').click();
  await expect(page.getByTestId('lesson-result')).toContainText('Your prediction matches the calculation');
  await page.goto('/#/learn');
  await expect(page.getByText('Completed').first()).toBeVisible();

  // Brief shows a reproducibility hash.
  await page.goto('/#/brief');
  await expect(page.getByTestId('repro-hash')).toHaveText(/^[0-9a-f]{64}$/);
});

test('fixed CPR mode disables rate and recapture controls and ignores rates', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await page.getByTestId('mode-fixedCpr').check();
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  const npv = await page.getByTestId('kpi-npv-value').textContent();
  await expect(page.getByTestId('ctl-shock').locator('input[type=number]')).toBeDisabled();
  await expect(page.getByTestId('ctl-recapture')).toContainText('Disabled');
  await openTab(page, 'recapture');
  await expect(page.getByTestId('recapture-panel')).toContainText('Not available');
  await openTab(page, 'ledger');

  // Issue 2: fixed CPR gives a speed, not a cause, so the cause split is not applicable.
  const ledger = page.getByTestId('month-ledger');
  await expect(ledger.getByText('Not applicable: this mode does not identify payoff causes')).toHaveCount(2);
  await expect(ledger.getByRole('row', { name: /of which unclassified/ })).not.toContainText('Not applicable');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  const [header, ...rows] = readFileSync((await dl.path())!, 'utf8').trim().split('\r\n').map((l) => l.split(','));
  const col = (name: string) => header.indexOf(name);
  for (const name of ['expected_refinance_payoffs', 'expected_turnover_payoffs', 'refinance_prepaid_principal', 'turnover_prepaid_principal']) {
    expect(rows.every((r) => r[col(name)] === 'not applicable'), name).toBe(true);
  }
  // Total prepayment is preserved: every prepaid dollar is unclassified, none is called turnover.
  for (const r of rows) {
    expect(Number(r[col('unclassified_prepaid_principal')])).toBeCloseTo(Number(r[col('prepaid_principal')]), 6);
    expect(Number(r[col('expected_unclassified_payoffs')])).toBeCloseTo(Number(r[col('expected_voluntary_payoffs')]), 9);
  }
  expect(rows.some((r) => Number(r[col('prepaid_principal')]) > 0)).toBe(true);

  await setNumber(page, 'ctl-cpr', '12');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('kpi-npv-value')).not.toHaveText(npv!);
});

test('out-of-range input is rejected with a reason, not silently clamped', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-offer', '1.5');
  await setNumber(page, 'ctl-shock', '-100');
  await expect(page.getByTestId('run-errors')).toContainText('outside the supported 1% to 15% range');
  await expect(page.getByTestId('run')).toBeDisabled();
  await setNumber(page, 'ctl-shock', '-400');
  await expect(page.getByTestId('ctl-shock')).toContainText('Allowed range');
});
