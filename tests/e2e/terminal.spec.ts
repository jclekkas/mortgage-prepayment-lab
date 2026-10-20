/**
 * The v4 "terminal" shell: one Run button and one status line, scenario tabs that carry each
 * scenario's value, keyboard shortcuts (which can be turned off), the Month by month tab, the
 * resizable assumptions panel, the 12px text floor and green/red used only for better/worse tags.
 */
import { expect, test, type Page } from '@playwright/test';
import { openTab, startFresh } from './fixtures';

const PAGES = ['overview', 'lab', 'cohorts', 'decision', 'validation', 'guided', 'learn', 'learn/one-dollar', 'glossary', 'methodology', 'brief'];

async function runRateCut(page: Page) {
  await page.getByRole('button', { name: /^Rates −100 bp/ }).click();
  await expect(page.getByTestId('dirty-badge')).toContainText('1 change from baseline · results up to date');
}

test('one Run button and one status line on every page; tabs carry value and change', async ({ page }) => {
  await startFresh(page);
  for (const r of PAGES) {
    await page.goto(`/#/${r}`);
    await expect(page.getByTestId('run'), r).toHaveCount(1);
    await expect(page.getByTestId('dirty-badge'), r).toHaveCount(1);
  }
  await page.goto('/#/overview');
  await runRateCut(page);
  await expect(page.getByTestId('scenario-tab-1')).toContainText('Value $3.52M frozen');
  const tab2 = page.getByTestId('scenario-tab-2');
  await expect(tab2).toContainText('Value $3.05M');
  await expect(tab2).toContainText('−$470.4K');
  await expect(tab2).toContainText('lower');
  await expect(tab2.locator('.chg-bad')).toHaveCount(1);
  // Loan owner view: the tab shows average life, a direction only (no better/worse color).
  await page.getByTestId('perspective-owner').click();
  await expect(tab2).toContainText('Average life 7.30 years');
  await expect(tab2).toContainText('shorter');
  await expect(tab2.locator('.chg-good, .chg-bad')).toHaveCount(0);
  // Baseline: the Run button is disabled and the status line says why.
  await page.getByTestId('scenario-tab-1').click();
  await expect(page.getByTestId('dirty-badge')).toHaveText('Baseline is frozen. Pick a scenario to edit.');
  await expect(page.getByTestId('run')).toBeDisabled();
});

test('hero shows a short headline; the long one is the first Why point; experiment undo re-runs', async ({ page }) => {
  await startFresh(page);
  await runRateCut(page);
  await expect(page.getByTestId('short-headline')).toHaveText('Scenario 1: lifetime servicing value lower, −$470.4K (−13.3%). Prepayment is faster (7.76% → 11.18%).');
  await expect(page.getByTestId('explanation-headline')).toContainText('Under your lower-rate assumption');
  await expect(page.getByTestId('balance-line')).toContainText('$331.72M across 1,000 loans');
  await page.getByTestId('quick-undo').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('Matches the baseline · results up to date');
  await expect(page.getByTestId('quick-undo')).toHaveCount(0);
});

test('new scenario starts from the baseline; at four scenarios the button is disabled', async ({ page }) => {
  await startFresh(page);
  await page.getByTestId('new-scenario').click();
  await expect(page.getByTestId('scenario-tab-3')).toContainText('Scenario 2');
  await expect(page.getByTestId('scenario-tab-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('dirty-badge')).toContainText('Matches the baseline');
  await page.getByTestId('new-scenario').click();
  await expect(page.getByTestId('new-scenario')).toBeDisabled();
});

test('keyboard shortcuts work, pause in fields, and can be turned off', async ({ page }) => {
  await startFresh(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/#\/lab$/);
  await page.keyboard.press('1');
  await expect(page.getByTestId('scenario-tab-1')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('2');
  await expect(page.getByTestId('scenario-tab-2')).toHaveAttribute('aria-pressed', 'true');
  // Typing in a field never triggers a shortcut.
  const shock = page.getByTestId('ctl-shock').locator('input[type=number]');
  await shock.fill('-50');
  await shock.press('r');
  await expect(page.getByTestId('dirty-badge')).toContainText('edited, press Run');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('r');
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await page.keyboard.press('p');
  await expect(page.getByTestId('kpi-section')).toHaveAttribute('data-perspective', 'owner');
  await page.keyboard.press('p');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/#\/decision$/);
  // The dialog opens with ?, traps focus, closes with Escape and returns focus.
  await page.keyboard.press('?');
  const dialog = page.getByTestId('keys-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Turn single-key shortcuts off (WCAG 2.1.4): keys then do nothing.
  await page.getByTestId('keys-button').click();
  await page.getByTestId('shortcuts-toggle').uncheck();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('o');
  await expect(page).toHaveURL(/#\/decision$/);
  // The setting is remembered on this device.
  await page.reload();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('o');
  await expect(page).toHaveURL(/#\/decision$/);
});

test('Month by month tab: bars scaled to the range shown, a row opens the month ledger', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await openTab(page, 'book');
  const book = page.getByTestId('month-book');
  await expect(book).toContainText('first 36 months');
  await expect(book.locator('tbody tr')).toHaveCount(36);
  const widths = await book.locator('.bar.left').evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.width)));
  expect(Math.min(...widths)).toBeCloseTo(12, 5);
  expect(Math.max(...widths)).toBeCloseTo(100, 5);
  await book.locator('tbody tr').nth(4).getByRole('button').click();
  await expect(page.getByTestId('tab-ledger')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('month-ledger')).toContainText('month 5');
});

test('assumptions panel resizes by keyboard within its limits and remembers the width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startFresh(page);
  await page.goto('/#/lab');
  const handle = page.getByRole('separator', { name: 'Resize the assumptions panel' });
  await expect(handle).toHaveAttribute('aria-valuenow', '340');
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '360');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '260');
  await page.reload();
  await expect(page.getByRole('separator', { name: 'Resize the assumptions panel' })).toHaveAttribute('aria-valuenow', '260');
  await page.getByRole('separator', { name: 'Resize the assumptions panel' }).dblclick();
  await expect(page.getByRole('separator', { name: 'Resize the assumptions panel' })).toHaveAttribute('aria-valuenow', '340');
});

test('assumption groups say how many inputs differ from the baseline', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await expect(page.getByTestId('group-market')).not.toContainText('changed');
  await page.getByTestId('ctl-shock').locator('input[type=number]').fill('-100');
  await expect(page.getByTestId('group-market').locator('summary')).toContainText('1 changed');
});

test('glossary search filters terms', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/glossary');
  await page.getByTestId('glossary-search').fill('burnout');
  await expect(page.getByText(/^\d+ of \d+ terms match\.$/)).toBeVisible();
  await expect(page.locator('dt').first()).toContainText(/burnout/i);
});

for (const width of [1440, 390]) {
  test(`no visible text under 12px; green and red only on better/worse tags (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startFresh(page);
    await runRateCut(page);
    for (const r of ['start', ...PAGES]) {
      await page.goto(`/#/${r}`);
      await page.waitForTimeout(400);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const better = getComputedStyle(document.documentElement).getPropertyValue('--better').trim();
        const worse = getComputedStyle(document.documentElement).getPropertyValue('--worse').trim();
        const probe = document.createElement('span');
        document.body.appendChild(probe);
        const resolve = (c: string) => { probe.style.color = c; return getComputedStyle(probe).color; };
        const green = resolve(better), red = resolve(worse);
        probe.remove();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !n.textContent?.trim()) continue;
          const st = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          // Visually hidden text (sr-only) is exempt.
          if (r.width <= 1 || r.height <= 1 || st.visibility === 'hidden' || el.closest('.sr-only')) continue;
          if (parseFloat(st.fontSize) < 11.99 && !el.closest('svg')) out.push(`small text ${st.fontSize}: ${n.textContent.trim().slice(0, 40)}`);
          if ((st.color === green || st.color === red) && !el.closest('.trend-good, .trend-bad, .chg-good, .chg-bad')) out.push(`green/red outside a tag: ${n.textContent.trim().slice(0, 40)}`);
        }
        // Chart axis text: rendered size, not the viewBox size.
        for (const t of document.querySelectorAll('.chart svg text')) {
          const h = (t as SVGTextElement).getBoundingClientRect().height;
          if (h > 0 && h < 11.5) out.push(`small chart text ${h.toFixed(1)}px: ${t.textContent}`);
        }
        return out;
      });
      expect(problems, `${r}: ${problems.join('\n')}`).toEqual([]);
    }
  });
}
