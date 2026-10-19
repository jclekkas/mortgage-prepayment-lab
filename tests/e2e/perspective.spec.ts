import { expect, test } from '@playwright/test';
import { startFresh } from './fixtures';

test('one perspective drives cards, the loan-group table and the lab details', async ({ page }) => {
  await startFresh(page);
  await page.getByTestId('perspective-owner').click();
  await expect(page.getByTestId('kpi-section')).toHaveAttribute('data-perspective', 'owner');
  await expect(page.getByTestId('kpi-section')).toContainText('does not calculate the investment’s value');
  await expect(page.getByTestId('kpi-npv')).toHaveCount(0);

  await page.goto('/#/cohorts');
  await expect(page.getByTestId('cohort-table')).toHaveAttribute('data-perspective', 'owner');
  await expect(page.getByTestId('cohort-table')).not.toContainText('Servicing NPV');
  await expect(page.getByTestId('cohort-perspective')).toContainText('does not calculate the loan owner’s investment value');

  await page.goto('/#/lab');
  await expect(page.getByTestId('detail-perspective')).toContainText('loan owner');

  // Switching back anywhere switches it everywhere.
  await page.goto('/#/cohorts');
  await page.getByTestId('perspective-servicer').click();
  await expect(page.getByTestId('cohort-table')).toContainText('Servicing NPV');
  await page.goto('/#/overview');
  await expect(page.getByTestId('kpi-section')).toHaveAttribute('data-perspective', 'servicer');
  await expect(page.getByTestId('kpi-npv')).toBeVisible();
});
