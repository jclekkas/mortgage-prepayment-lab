import { expect, test } from '@playwright/test';
import { setNumber, startFresh } from './fixtures';

// Measured, not asserted tightly: logs p50/p95 for docs/PERFORMANCE.md and fails only on a
// pathological regression. Local preview server, so network time is excluded.
test('browser timings: first useful display and run-to-result', async ({ page, browserName }) => {
  await startFresh(page);
  const t0 = Date.now();
  await page.goto('about:blank');
  await page.goto('/#/overview');
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
  const firstDisplay = Date.now() - t0;

  await page.goto('/#/lab');
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    await setNumber(page, 'ctl-shock', String(-100 - i * 5));
    const s = Date.now();
    await page.getByTestId('run').click();
    await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
    times.push(Date.now() - s);
  }
  times.sort((a, b) => a - b);
  const p50 = times[10], p95 = times[18];
  // Calculation round trip (worker compute + transfer), measured in the page by the app's own marks.
  const calc = (await page.evaluate(() => performance.getEntriesByName('mpl:run-roundtrip').map((e) => e.duration))).slice(-20).sort((a, b) => a - b);
  const c50 = Math.round(calc[10]), c95 = Math.round(calc[18]);
  console.log(`[perf-browser] ${browserName}: first useful display ${firstDisplay}ms; calculation round trip 1k loans p50=${c50}ms p95=${c95}ms; click-to-rendered-result p50=${p50}ms p95=${p95}ms`);
  // PRD target: 1,000 loans x 360 months calculated within 1 s at p95.
  expect(c95).toBeLessThan(1000);
  expect(firstDisplay).toBeLessThan(2500);
  // End-to-end including rendering. CI's Linux WebKit renders without a GPU and is not
  // representative of Safari on macOS, so it gets a looser ceiling; both are logged above.
  expect(p95).toBeLessThan(browserName === 'webkit' ? 5000 : 1000);
});
