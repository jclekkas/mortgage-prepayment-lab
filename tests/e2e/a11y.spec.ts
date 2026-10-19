import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startFresh } from './fixtures';

const PAGES = ['overview', 'lab', 'cohorts', 'decision', 'validation', 'learn', 'learn/one-dollar', 'glossary', 'methodology', 'brief'];

test('axe finds no WCAG A/AA violations on the main pages', async ({ page }) => {
  await startFresh(page);
  for (const r of PAGES) {
    await page.goto(`/#/${r}`);
    await page.waitForTimeout(700);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const summary = res.violations.map((v) => `${r}: ${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes[0]?.target.join(' ')}`);
    expect(summary, summary.join('\n')).toEqual([]);
  }
  await page.goto('/#/start');
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(res.violations.map((v) => v.id)).toEqual([]);
});

test('keyboard only: start, edit a control, run', async ({ page }) => {
  await page.goto('/#/start');
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mortgage-prepayment-lab'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.reload();
  await page.getByTestId('start').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
  await page.goto('/#/lab');
  const shock = page.getByTestId('ctl-shock').locator('input[type=range]');
  await shock.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('ctl-shock').locator('input[type=number]')).toHaveValue('-50');
  await page.getByTestId('run').focus();
  await expect(page.getByTestId('run')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs');
  await expect(page.getByTestId('announcer')).toContainText('Calculation complete');
  // Focus stays on the Run button after recalculation.
  await expect(page.getByTestId('run')).toBeFocused();
  // Chart month selection by keyboard.
  const chart = page.getByTestId('chart-cpr').locator('svg');
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('month-ledger')).toContainText('month 3');
});

for (const width of [390, 768, 1280]) {
  test(`no page-wide horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startFresh(page);
    for (const r of ['overview', 'lab', 'cohorts', 'decision', 'validation', 'learn/rates-fall']) {
      await page.goto(`/#/${r}`);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${r} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}
