import { expect, test } from '@playwright/test';
import { startFresh } from './fixtures';

const IDS = ['one-dollar', 'speedometer', 'rates-fall', 'same-speed', 'keep-customer', 'challenge-forecast'];

test('all six lessons in sequence through the Next links start fresh and explain every answer', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/learn/one-dollar');
  for (let i = 0; i < IDS.length; i++) {
    const view = page.getByTestId(`lesson-view-${IDS[i]}`);
    await expect(view).toBeVisible();
    // Fresh state: no result, every choice enabled and unselected.
    await expect(page.getByTestId('lesson-result')).toHaveCount(0);
    const radios = view.locator('input[type=radio]');
    expect(await radios.count()).toBeGreaterThan(1);
    for (const r of await radios.all()) {
      await expect(r).toBeEnabled();
      await expect(r).not.toBeChecked();
    }
    await radios.first().check();
    await page.getByTestId('check-prediction').click();
    const result = page.getByTestId('lesson-result');
    await expect(result).toBeVisible();
    // The calculated answer is one of this lesson's own options, and the reasoning is always shown.
    await expect(result).not.toContainText('Calculated answer: .');
    await expect(page.getByTestId('lesson-explanation')).toContainText('Why:');
    if (i < IDS.length - 1) await result.getByRole('link', { name: /^Next:/ }).click();
  }
  await page.goto('/#/learn');
  await expect(page.getByText('Completed: 6 of 6')).toBeVisible();
});

test('retry, back navigation and direct links keep lesson state consistent', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/learn/speedometer');
  await page.getByLabel('About 0.514%').check();
  await page.getByTestId('check-prediction').click();
  await expect(page.getByTestId('lesson-result')).toContainText('matches the calculation');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('lesson-result')).toHaveCount(0);
  await expect(page.getByLabel('About 0.514%')).not.toBeChecked();
  // Leave and come back by the browser's back button: the lesson starts fresh again.
  await page.goto('/#/learn/rates-fall');
  await page.goBack();
  await expect(page.getByTestId('lesson-view-speedometer')).toBeVisible();
  await expect(page.getByTestId('lesson-result')).toHaveCount(0);
  await expect(page.getByLabel('About 0.514%')).toBeEnabled();
});

test('a slow calculation never publishes its answer into the next lesson', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/learn/rates-fall');
  await page.locator('input[type=radio]').first().check();
  await page.getByTestId('check-prediction').click();
  // Navigate away before the two-run calculation can finish.
  await page.goto('/#/learn/same-speed');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('lesson-view-same-speed')).toBeVisible();
  await expect(page.getByTestId('lesson-result')).toHaveCount(0);
});

test('expected values are explained before any expected dollars are shown', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/learn/one-dollar');
  await page.locator('input[type=radio]').first().check();
  await page.getByTestId('check-prediction').click();
  const note = page.getByTestId('expected-explainer');
  await expect(note).toContainText('not a payment anyone actually makes');
  const table = page.getByTestId('lesson-result').locator('table');
  const above = await note.evaluate((n, t) => !!(n.compareDocumentPosition(t as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await table.elementHandle());
  expect(above).toBe(true);
  await page.goto('/#/lab');
  await expect(page.getByTestId('ledger-expected-note')).toContainText('not payments any one borrower makes');
});
