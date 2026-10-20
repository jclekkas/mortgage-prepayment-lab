import { expect, test } from '@playwright/test';
import { startFresh } from './fixtures';

test('scenario deletion is visible, cancellable, and preserves the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFresh(page);
  await page.getByTestId('new-scenario').click();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Delete selected scenario', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep my scenarios' })).toBeFocused();
  // Workspace keyboard shortcuts must not operate behind a destructive confirmation.
  await page.getByRole('button', { name: 'Keep my scenarios' }).press('1');
  await expect(page.getByTestId('scenario-tab-3')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Keep my scenarios' }).click();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Delete selected scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete scenario', exact: true }).click();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete all scenarios (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete all scenarios', exact: true }).click();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(1);
  await expect(page.getByTestId('scenario-tab-1')).toContainText('Frozen baseline');
  await expect(page.getByRole('button', { name: 'Delete selected scenario', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete all scenarios (0)', exact: true })).toBeDisabled();
  // Allow the app's documented 600ms autosave debounce before checking persisted deletion.
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(1);
  await page.getByTestId('new-scenario').click();
  await expect(page.getByTestId('scenario-tabs').getByRole('button')).toHaveCount(2);
});
