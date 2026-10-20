import { expect, test } from '@playwright/test';
import { setNumber, startFresh } from './fixtures';

test('quick experiments say what they change, keep other edits, and refuse incompatible models', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/overview');
  await expect(page.getByTestId('quick-scope')).toContainText('none so far');
  // Make an unrelated edit in the lab, then use a shortcut: the edit must be kept and listed.
  await page.goto('/#/lab');
  await setNumber(page, 'ctl-turnover', '1.5');
  await page.goto('/#/overview');
  await expect(page.getByTestId('quick-scope')).toContainText('Turnover multiplier');
  await page.getByRole('button', { name: /^Rates −100 bp/ }).click();
  await expect(page.getByTestId('explanation')).toContainText('Rate shock: 0 basis points → -100 basis points');
  await expect(page.getByTestId('explanation')).toContainText('Turnover multiplier');
  // Two inputs changed, so the headline must not credit the rate cut alone.
  await expect(page.getByTestId('explanation-headline')).not.toContainText('Under your lower-rate assumption');

  // A fixed-rate scenario: rate and recapture shortcuts are disabled with a reason, and the model is not switched.
  await page.goto('/#/lab');
  await page.getByTestId('mode-fixedCpr').check();
  await page.getByTestId('run').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await page.goto('/#/overview');
  await expect(page.getByRole('button', { name: /^Rates −100 bp/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Recapture 40%/ })).toBeDisabled();
  await expect(page.getByTestId('quick-needs-behavioral')).toContainText('Needs the behavioral model');
  await page.getByRole('button', { name: /^Cost \$150 a loan/ }).click();
  await expect(page.locator('.rail-foot')).toContainText('Fixed conditional prepayment rate (CPR) model');
});
