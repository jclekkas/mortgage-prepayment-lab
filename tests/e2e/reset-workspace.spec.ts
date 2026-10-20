import { expect, test } from '@playwright/test';
import { startFresh, reveal } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

test('restart clears the saved and open workspace, while Cancel preserves it', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Rates −100 bp/ }).click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await page.goto('/#/credit');
  await page.getByTestId('credit-simulate').click();
  await page.getByTestId('credit-apply').click();
  await page.goto('/#/validation');
  await page.getByTestId('hypothesis').fill('Remove this old hypothesis');
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'Clear workspace and start over', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep my workspace' })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Keep my workspace' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/#/validation');
  await expect(page.getByTestId('hypothesis')).toHaveValue('Remove this old hypothesis');
  // Edit immediately before reset so the debounce cannot silently write the old workspace back.
  await page.evaluate(async () => {
    localStorage.setItem('mpl-pref:reset-test', 'old');
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('mortgage-prepayment-lab', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ file: 'old backup' }, 'workspace-unreadable-backup');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  });
  await page.getByTestId('hypothesis').fill('Unsaved work must also disappear');
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'Clear workspace and start over', exact: true }).click();
  await page.getByRole('button', { name: 'Clear everything and restart', exact: true }).click();
  await expect(page).toHaveURL(/#\/start$/);
  await expect(page.getByTestId('start')).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('mpl-pref:reset-test'))).toBeNull();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('dirty-badge')).toContainText('results up to date');
  await page.goto('/#/validation');
  await expect(page.getByTestId('hypothesis')).toHaveValue('');
  await page.goto('/#/credit');
  await expect(page.getByTestId('credit-simulate')).toBeVisible();
  await expect(page.getByTestId('credit-revert')).toHaveCount(0);
  await page.goto('/#/decision/files');
  await expect(page.getByTestId('download-backup')).toHaveCount(0);
  await page.goto('/#/lab');
  await reveal(page, 'ctl-shock');
  await expect(page.getByRole('spinbutton', { name: 'Rate shock', exact: true })).toHaveValue('0');
});

test('failed deletion reports failure and keeps the workspace open', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'Clear workspace and start over', exact: true }).click();
  await page.evaluate(() => { IDBObjectStore.prototype.clear = () => { throw new Error('Storage blocked for test'); }; });
  await page.getByRole('button', { name: 'Clear everything and restart', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be cleared');
  await expect(page).toHaveURL(/#\/home$/);
  await page.getByRole('button', { name: 'Keep my workspace' }).click();
  await expect(page.getByRole('link', { name: 'Resume workspace →', exact: true })).toBeVisible();
});
