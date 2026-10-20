/**
 * Acceptance check: a controlled comparison of two zero-fee scenarios that differ ONLY in the
 * rate shock (0 versus -100 basis points). It follows the written UI steps in
 * docs/ACCEPTANCE_REVIEW.md using visible labels, and checks the numbers against the engine.
 */
import { expect, test } from '@playwright/test';
import { openTab } from './fixtures';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { pct, usd } from '../../src/domain/format';
import { defaultScenario } from '../../src/domain/scenario';
import { diffInputs } from '../../src/domain/diff';

test('zero fee, 0 versus -100 bps: only the rate shock differs, and value improves while staying a loss', async ({ page }) => {
  const p = loadPreset('mixed');
  const zero = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  zero.servicingParameters.feeOverrideBps = 0;
  const cut = structuredClone(zero);
  cut.ratePath.shockBps = -100;
  // The comparison is controlled: exactly one model input differs.
  expect(diffInputs(zero, cut).map((c) => c.id)).toEqual(['shockBps']);
  const z = runScenario(p, zero).summary, c = runScenario(p, cut).summary;

  // 1-2. Fresh start on the Mixed book, dashboard.
  await page.goto('/#/start');
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mortgage-prepayment-lab'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto('/#/start');
  await page.getByRole('button', { name: /Mixed book/ }).click();
  await page.getByRole('button', { name: 'Skip the guide and open the dashboard' }).click();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();

  // 3-5. Scenario lab, Scenario 1: turn on the hypothetical fee, set it to 0, Run.
  await page.getByRole('navigation').getByRole('link', { name: 'Scenario lab' }).click();
  await page.getByLabel(/Use a hypothetical servicing fee instead of the contract/).check();
  await page.getByTestId('ctl-fee').locator('input[type=number]').fill('0');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');

  // 6. Make it the baseline: the zero-fee, no-shock run becomes the comparison point.
  await page.getByRole('button', { name: 'Make baseline' }).click();
  await page.getByTestId('scenario-tab-1').click();
  await expect(page.getByTestId('scenario-tab-1')).toContainText('Baseline (from Scenario 1)');
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(usd(z.servicingNpv, { compact: true }));

  // 7-8. Back to Scenario 1 (still fee 0), set the rate shock to -100, Run.
  await page.getByTestId('scenario-tab-2').click();
  await page.getByTestId('ctl-shock').locator('input[type=number]').fill('-100');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');

  // 9. Read the comparison.
  await expect(page.getByTestId('kpi-cpr-value')).toHaveText(pct(c.nextMonthCpr));
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(usd(c.servicingNpv, { compact: true }));
  await expect(page.getByTestId('kpi-cpr')).toContainText('faster');
  await expect(page.getByTestId('kpi-npv')).toContainText('smaller loss');
  await expect(page.getByTestId('kpi-net12')).toContainText('smaller loss');

  // The explanation names the only changed input and splits value into fees and costs.
  await page.goto('/#/decision');
  await openTab(page, 'compare');
  await expect(page.getByTestId('compare-table')).toBeVisible();
  await page.goto('/#/lab');
  const body = page.locator('body');
  await expect(body).toContainText('Under your lower-rate assumption');
  await expect(body).toContainText('servicing fees do not change');
  await expect(body).toContainText('A smaller loss is not a profit');
});
