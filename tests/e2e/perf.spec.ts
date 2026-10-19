import { expect, test } from '@playwright/test';
import { setNumber, startFresh } from './fixtures';

// Measured, not asserted tightly: logs p50/p95 for docs/PERFORMANCE.md and fails only on a
// pathological regression. Local preview server, so network time is excluded.
test('browser timings: first useful display and run-to-result', async ({ page }) => {
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
    await expect(page.getByTestId('dirty-badge')).toHaveText('Results match inputs');
    times.push(Date.now() - s);
  }
  times.sort((a, b) => a - b);
  const p50 = times[10], p95 = times[18];
  console.log(`[perf-browser] first useful display ${firstDisplay}ms; run-to-result 1k loans p50=${p50}ms p95=${p95}ms`);
  expect(p95).toBeLessThan(1000);
  expect(firstDisplay).toBeLessThan(2500);
});
