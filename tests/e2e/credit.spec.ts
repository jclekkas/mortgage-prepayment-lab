/**
 * Credit score refresh workspace: navigation, the simulate / preview / apply / revert workflow,
 * repeatability, unchanged financial results, filtering, persistence, export and import.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadPreset } from '../../src/data/presets';
import { comparePairs, creditFixture, summarize } from '../../src/domain/credit';
import { selectPopulation } from '../../src/domain/engine';
import { openTab, startFresh } from './fixtures';

const p = loadPreset('mixed');
const f = creditFixture(p);
const [orig, prior, next] = f.snapshots;
const expected = (filter = {}) => {
  const pop = selectPopulation(p, filter);
  return { pop, cmp: comparePairs(pop, [orig, prior], next, f.analysisDate), cur: summarize(pop, [orig, prior], f.analysisDate) };
};

async function axe(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = res.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('navigation, simulate, preview, discard, apply and revert, with financial results unchanged', async ({ page }) => {
  await startFresh(page);
  // Placed between Loan groups and Decision room.
  // textContent, not innerText: on a phone the menu is collapsed until opened.
  const items = (await page.locator('#main-nav a').allTextContents()).map((t) => t.trim());
  const i = items.indexOf('Credit score refresh');
  expect(items.slice(i - 1, i + 2)).toEqual(['Loan groups', 'Credit score refresh', 'Decision room']);
  await expect(page.getByTestId('overview-credit-card')).toContainText('Prepayment results do not use scores');
  await page.getByTestId('overview-credit-link').click();
  await expect(page.locator('#page-title')).toHaveText('Credit score refresh');
  await expect(page.getByTestId('credit-data-label')).toHaveText('Illustrative score data, not actual FICO Scores');
  await expect(page.getByTestId('credit-core')).toContainText('It does not itself improve a borrower’s credit or generate investment returns.');
  await expect(page.getByTestId('credit-analysis-date')).toHaveText('September 30, 2026');
  const { cmp, cur } = expected();
  await expect(page.getByTestId('credit-coverage')).toContainText(`${cur.usable.loans}`);

  const status = await page.getByTestId('dirty-badge').innerText();
  await openTab(page, 'forecast');
  await expect(page.getByTestId('credit-not-estimated')).toHaveText('Not estimated: the current prepayment model does not use credit scores.');
  await expect(page.getByTestId('credit-run-key')).not.toHaveText('No result yet');
  const runKey = await page.getByTestId('credit-run-key').innerText();
  const inputHash = await page.getByTestId('credit-input-hash').innerText();

  // Keyboard: simulate with Enter.
  await page.getByTestId('credit-simulate').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('credit-preview-notice')).toBeVisible();
  await openTab(page, 'changes');
  await expect(page.getByTestId('credit-comparable')).toHaveText(cmp.comparable.loans.toLocaleString());
  await expect(page.getByTestId('credit-direction')).toContainText(`Score increased${cmp.increased.loans}`);
  await expect(page.getByTestId('credit-direction')).toContainText(`Score decreased${cmp.decreased.loans}`);
  await expect(page.getByTestId('credit-direction')).toContainText('Score version changed');
  await axe(page, 'credit preview');

  // Discard, then simulate again: identical figures (no new random draw).
  await page.getByTestId('credit-discard').click();
  await expect(page.getByTestId('credit-no-change')).toBeVisible();
  await page.getByTestId('credit-simulate').click();
  await expect(page.getByTestId('credit-comparable')).toHaveText(cmp.comparable.loans.toLocaleString());

  await page.getByTestId('credit-apply').click();
  await expect(page.getByTestId('credit-applied-notice')).toBeVisible();
  await expect(page.getByTestId('credit-applied')).toContainText('Newest refresh, September 2026 (simulated)');
  // The comparison with the earlier information is kept.
  await expect(page.getByTestId('credit-comparable')).toHaveText(cmp.comparable.loans.toLocaleString());
  await expect(page.getByTestId('dirty-badge')).toHaveText(status);
  await openTab(page, 'forecast');
  await expect(page.getByTestId('credit-run-key')).toHaveText(runKey);
  await expect(page.getByTestId('credit-input-hash')).toHaveText(inputHash);
  for (const t of ['forecast', 'breakeven', 'learn']) { await openTab(page, t); await axe(page, `credit ${t}`); }
  await expect(page.getByTestId('credit-example')).toContainText('Version change');
  await expect(page.getByTestId('credit-date-rules')).toContainText('October 14, 2026');

  // Results elsewhere are untouched: the overview headline still shows the same value.
  await page.goto('./#/overview');
  await expect(page.getByTestId('overview-credit-card')).toContainText('Newest refresh');
  await page.goto('./#/credit');
  await page.getByTestId('credit-revert').click();
  await expect(page.getByTestId('credit-simulate')).toBeVisible();
  await expect(page.getByTestId('credit-applied')).toContainText('Earlier information in use');
});

test('filtered population: every total reconciles to the selected loans', async ({ page }) => {
  await startFresh(page);
  await page.goto('./#/cohorts');
  await page.getByTestId('filter-coupon-ge7').check();
  await page.goto('./#/credit');
  const { pop, cmp } = expected({ coupon: ['ge7'] });
  await expect(page.getByTestId('credit-coverage')).toContainText(`Selected population (denominator)${pop.length.toLocaleString()}`);
  await page.getByTestId('credit-simulate').click();
  await expect(page.getByTestId('credit-comparable')).toHaveText(cmp.comparable.loans.toLocaleString());
  await expect(page.getByTestId('credit-direction')).toContainText(`Selected population (total)${pop.length.toLocaleString()}`);
});

test('break-even: assumptions only, undefined when contribution is not positive', async ({ page }) => {
  await startFresh(page);
  await page.goto('./#/credit');
  await openTab(page, 'breakeven');
  await expect(page.getByTestId('be-net')).toHaveText('$0');
  await expect(page.getByTestId('be-break-even')).toContainText('Undefined');
  await page.getByTestId('be-use-population').click();
  await page.getByTestId('be-unitCost').fill('2');
  await page.getByTestId('be-fixedCost').fill('5000');
  await expect(page.getByTestId('be-total-cost')).toHaveText('$7,000');
  await expect(page.getByTestId('be-net')).toContainText('net cost');
  await page.getByTestId('be-contributionPerOutcome').fill('1000');
  await expect(page.getByTestId('be-break-even')).toHaveText('7 outcomes');
  await page.getByTestId('be-unitCost').fill('-1');
  await expect(page.getByTestId('credit-breakeven')).toContainText('Enter a number from 0');
  await expect(page.getByTestId('be-total-cost')).toHaveText('$7,000');
});

test('applied refresh and break-even inputs persist, export and import with provenance', async ({ page }) => {
  await startFresh(page);
  await page.goto('./#/credit');
  await page.getByTestId('credit-simulate').click();
  await page.getByTestId('credit-apply').click();
  await openTab(page, 'breakeven');
  await page.getByTestId('be-unitCost').fill('3');
  await page.waitForTimeout(900); // debounced save

  // Reload: the applied snapshot and the input survive; scenarios still run.
  await page.reload();
  await expect(page.getByTestId('credit-applied-notice')).toBeVisible();
  await openTab(page, 'breakeven');
  await expect(page.getByTestId('be-unitCost')).toHaveValue('3');

  // Per-loan CSV keeps provenance.
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('credit-export-csv').click()]);
  const csvText = readFileSync((await csv.path())!, 'utf8');
  expect(csvText.split('\r\n')[0]).toContain('snapshot_fingerprint');
  expect(csvText).toContain('Illustrative score data, not actual FICO Scores');
  expect(csvText).toContain(next.id);

  // Scenario file carries the credit block; importing it reproduces results and restores the selection.
  await page.goto('./#/decision');
  await openTab(page, 'files');
  await expect(page.getByTestId('export-json')).toBeEnabled();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const text = readFileSync((await dl.path())!, 'utf8');
  const file = JSON.parse(text);
  expect(file.credit.usedByPrepaymentResults).toBe(false);
  expect(file.credit.appliedSnapshots.map((s: { id: string }) => s.id)).toEqual(f.snapshots.map((s) => s.id));
  expect(file.credit.appliedSnapshots[2].fingerprint).toBe(next.fingerprint);

  await page.goto('./#/credit');
  await page.getByTestId('credit-revert').click();
  await page.goto('./#/decision');
  await openTab(page, 'files');
  await page.getByTestId('import-input').setInputFiles({ name: 'scenarios.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced \d of \d saved results/);
  await page.goto('./#/credit');
  await expect(page.getByTestId('credit-applied-notice')).toBeVisible();

  // A tampered fingerprint is explained and falls back; scenarios still import.
  const bad = structuredClone(file);
  bad.credit.appliedSnapshots[2].fingerprint = '0'.repeat(64);
  await page.goto('./#/decision');
  await openTab(page, 'files');
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByTestId('import-credit-note')).toContainText('fingerprint differs');
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced \d of \d saved results/);
  await page.goto('./#/credit');
  await expect(page.getByTestId('credit-simulate')).toBeVisible();
});

test('a scenario file without credit data (from an earlier build) imports with the default information', async ({ page }) => {
  await startFresh(page);
  await page.goto('./#/decision');
  await openTab(page, 'files');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const file = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  delete file.credit;
  await page.getByTestId('import-input').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByTestId('import-message')).toContainText(/Reproduced \d of \d saved results/);
  await expect(page.getByTestId('import-credit-note')).toHaveCount(0);
  await page.goto('./#/credit');
  await expect(page.getByTestId('credit-applied')).toContainText('Earlier information in use');
});
