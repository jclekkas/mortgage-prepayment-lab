import { expect, type Page } from '@playwright/test';

export async function startFresh(page: Page, preset = 'mixed') {
  await page.goto('/#/start');
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mortgage-prepayment-lab'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto('/#/start');
  await page.getByTestId(`preset-${preset}`).click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
}

export async function setNumber(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId).locator('input[type=number]');
  await input.fill(value);
}
