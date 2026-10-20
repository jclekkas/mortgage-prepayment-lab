/**
 * First-learner journey against the hosted preview, run in every preview project (Chromium and
 * WebKit, desktop light and phone dark). Expected numbers come from the engine source.
 */
import { expect, test, type Page } from '@playwright/test';
import { openTab, reveal } from '../e2e/fixtures';
import { readFileSync } from 'node:fs';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { pct } from '../../src/domain/format';
import { defaultScenario } from '../../src/domain/scenario';

const LESSONS = ['one-dollar', 'speedometer', 'rates-fall', 'same-speed', 'keep-customer', 'challenge-forecast'];

function watchErrors(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  return problems;
}

test('start, guided experiment, edit without running, run, compare, perspective, filter, export, import, credit refresh, six lessons', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = watchErrors(page);
  const p = loadPreset('mixed');
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const half = runScenario(p, { ...base, ratePath: { ...base.ratePath, shockBps: -50 } }).summary;

  // Start and the guided experiment.
  await page.goto('./#/start');
  await page.getByTestId('preset-mixed').click();
  await page.getByTestId('start-guided').click();
  await expect(page.getByRole('heading', { name: 'Three parties, one mortgage' })).toBeVisible();
  await page.getByTestId('guided-next').click();
  await expect(page.getByTestId('guided-assumptions')).toContainText('6.25%');
  await page.getByTestId('guided-next').click();
  for (const id of ['cpr', 'net12', 'npv']) await page.getByTestId(`guess-${id}-up`).check();
  await page.getByTestId('guided-apply').click();
  await expect(page.getByTestId('guided-row-cpr')).toContainText('faster');
  await expect(page.getByTestId('guided-row-npv')).toContainText('lower');
  await expect(page.getByTestId('guided-takeaway')).toContainText('The fees given up were larger, so value fell.');
  await page.getByTestId('guided-done').click();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();

  // Edit without running: results are marked as the previous run and exports pause.
  await page.goto('./#/lab');
  await reveal(page, 'ctl-shock');
  await page.getByTestId('ctl-shock').locator('input[type=number]').fill('-50');
  await expect(page.getByTestId('dirty-badge')).toContainText('edited');
  await expect(page.getByTestId('kpi-stale').first()).toBeVisible();
  await page.goto('./#/decision');
  await openTab(page, 'files');
  await expect(page.getByTestId('export-json')).toBeDisabled();

  // Run, then compare against the baseline with neutral speed words.
  await page.goto('./#/lab');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await expect(page.getByTestId('kpi-cpr-value')).toHaveText(pct(half.nextMonthCpr));
  await expect(page.getByTestId('kpi-cpr')).toContainText('faster');
  await expect(page.getByTestId('kpi-npv')).toContainText('lower');

  // Change perspective: cards and the loan-group table follow.
  await page.getByTestId('perspective-owner').click();
  await expect(page.getByTestId('kpi-section')).toHaveAttribute('data-perspective', 'owner');
  await expect(page.getByTestId('kpi-npv')).toHaveCount(0);
  await page.goto('./#/cohorts');
  await expect(page.getByTestId('cohort-table')).not.toContainText('Servicing NPV');
  await page.getByTestId('perspective-servicer').click();
  await expect(page.getByTestId('cohort-table')).toContainText('Servicing NPV');

  // Filter, then clear.
  await page.getByTestId('filter-coupon-ge7').check();
  await expect(page.getByTestId('population-badge')).toContainText('(filtered)');
  await page.goto('./#/overview');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('population-badge')).toContainText('all 1,000 loans');

  // Export and import: saved results reproduce.
  await page.goto('./#/decision');
  await openTab(page, 'files');
  await expect(page.getByTestId('export-json')).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  const file = JSON.parse(text);
  expect(file.modelVersion).toBe('mpl-engine-1.2.0');
  expect(file.appBuild).toBe(process.env.EXPECTED_COMMIT ?? file.appBuild);
  await page.getByTestId('import-input').setInputFiles({ name: 'scenarios.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced \d of \d saved results/);

  // Credit score refresh: synthetic preview, apply, results unchanged.
  await page.goto('./#/credit');
  await expect(page.getByTestId('credit-data-label')).toHaveText('Illustrative score data, not actual FICO Scores');
  const status = await page.getByTestId('dirty-badge').innerText();
  await page.getByTestId('credit-simulate').click();
  await expect(page.getByTestId('credit-preview-notice')).toBeVisible();
  await page.getByTestId('credit-apply').click();
  await expect(page.getByTestId('credit-applied-notice')).toBeVisible();
  await expect(page.getByTestId('dirty-badge')).toHaveText(status);
  await page.getByTestId('tab-forecast').click();
  await expect(page.getByTestId('credit-not-estimated')).toHaveText('Not estimated: the current prepayment model does not use credit scores.');
  await page.getByTestId('credit-revert').click();

  // All six lessons in order through the Next links, each starting fresh and explaining the answer.
  await page.goto('./#/learn/one-dollar');
  for (let i = 0; i < LESSONS.length; i++) {
    const view = page.getByTestId(`lesson-view-${LESSONS[i]}`);
    await expect(view).toBeVisible();
    await expect(page.getByTestId('lesson-result')).toHaveCount(0);
    await view.locator('input[type=radio]').first().check();
    await page.getByTestId('check-prediction').click();
    await expect(page.getByTestId('lesson-explanation')).toContainText('Why:');
    if (i < LESSONS.length - 1) await page.getByTestId('lesson-result').getByRole('link', { name: /^Next:/ }).click();
  }
  await page.goto('./#/learn');
  await expect(page.getByText('Completed: 6 of 6')).toBeVisible();

  // Keyboard: term help opens with Enter.
  await page.goto('./#/overview');
  const help = page.getByRole('button', { name: 'What is Conditional prepayment rate (CPR)?' }).first();
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');

  // No horizontal page scroll on this screen size.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  expect(problems, problems.join('\n')).toEqual([]);
});
