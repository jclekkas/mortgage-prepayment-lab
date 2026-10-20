import { expect, test } from '@playwright/test';
import { reveal, startFresh } from './fixtures';

test('blank, invalid, reset and decimal edits never silently run old inputs', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/lab');
  await reveal(page, 'ctl-shock');
  const shock = page.getByRole('spinbutton', { name: 'Rate shock', exact: true });
  await shock.fill('');
  await expect(shock).toHaveValue('');
  await expect(page.getByTestId('run')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset Rate shock to 0 basis points' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reset Rate shock to 0 basis points' }).click();
  await expect(shock).toHaveValue('0');
  await expect(page.getByTestId('run')).toBeEnabled();
  await shock.fill('9999');
  await expect(page.getByTestId('run')).toBeDisabled();
  await shock.press('Escape');
  await expect(shock).toHaveValue('0');
  const offer = page.getByRole('spinbutton', { name: 'Mortgage offer rate', exact: true });
  await offer.fill('');
  await offer.pressSequentially('5.25');
  await expect(offer).toHaveValue('5.25');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await shock.fill('');
  await page.getByRole('button', { name: 'Reset to baseline', exact: true }).click();
  await expect(shock).toHaveValue('0');
  await expect(page.getByTestId('run')).toBeEnabled();
});

test('Home preserves the workspace and sharing opens the correct files tab', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Rates −100 bp/ }).click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  const before = await page.getByTestId('scenario-tab-2').innerText();
  await page.getByRole('link', { name: 'Home — Prepayment Lab' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace is still here' })).toBeVisible();
  await page.getByRole('link', { name: 'Resume workspace →', exact: true }).click();
  await expect(page.getByTestId('scenario-tab-2')).toHaveText(before);
  await page.getByRole('link', { name: 'Share', exact: true }).click();
  await expect(page.getByLabel('Link to the home page')).toHaveValue(/#\/home$/);
  await page.getByRole('link', { name: 'Files and brief', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Files and brief' })).toHaveAttribute('aria-selected', 'true');
});

test('phone navigation always exposes Home and Share without opening the menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFresh(page);
  await expect(page.getByRole('link', { name: 'Home — Prepayment Lab' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Share', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home — Prepayment Lab' }).click();
  await expect(page.getByRole('heading', { name: 'What happens when borrowers pay their mortgages off early?', exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
});

test('credit calculator hides stale figures while a field is blank and can reset', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/credit');
  await page.getByRole('tab', { name: 'C. Break-even', exact: true }).click();
  await page.getByTestId('be-unitCost').fill('');
  await expect(page.getByTestId('be-results')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset calculator to zero' }).click();
  await expect(page.getByTestId('be-unitCost')).toHaveValue('0');
  await expect(page.getByTestId('be-results')).toBeVisible();
});
