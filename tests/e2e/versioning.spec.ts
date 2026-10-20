import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openTab, startFresh } from './fixtures';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/legacy/${n}`, import.meta.url), 'utf8');
const MIXED_FINGERPRINT = '4cbb1778461547d31453250d174554dee9f29790fdbdedcd8e87cd7bf9f469c5';

/** Put a record straight into the app's IndexedDB store, as an earlier build would have left it. */
async function seedSaved(page: Page, value: unknown) {
  // Seed on a blank same-origin document: the app must not read or autosave
  // the fixture until the caller opens it once. A reload followed by goto
  // could upgrade the legacy file before its migration notice was asserted.
  await page.route('**/__seed__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture setup</title>' }));
  await page.goto('/__seed__');
  await page.evaluate((v) => new Promise<void>((res, rej) => {
    const del = indexedDB.deleteDatabase('mortgage-prepayment-lab');
    del.onsuccess = del.onerror = del.onblocked = () => {
      const q = indexedDB.open('mortgage-prepayment-lab', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'workspace-v1'); t.oncomplete = () => { q.result.close(); res(); }; t.onerror = () => rej(t.error); };
      q.onerror = () => rej(q.error);
    };
  }), value);
  await page.unroute('**/__seed__');
}

test('an exported file from model 1.0.0 keeps assumptions and notes and is recalculated, not "reproduced"', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await openTab(page, 'files');
  await page.getByTestId('import-input').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(fixture('mpl-engine-1.0.0-before-threshold-fix.json')) });
  const msg = page.getByTestId('import-message');
  await expect(msg).toContainText('Recalculated with mpl-engine-1.1.0', { timeout: 30_000 });
  await expect(msg).toContainText('not checked as a reproduction');
  await expect(msg).toContainText('servicingNpv was');
  await expect(msg).not.toContainText('Did not reproduce');
  await openTab(page, 'notes');
  await expect(page.getByLabel('What I think changed')).toHaveValue('Written before the refinance-threshold correction.');
});

test('saved work from model 1.0.0 on this device is kept and recalculated with a notice', async ({ page }) => {
  await seedSaved(page, JSON.parse(fixture('mpl-engine-1.0.0-saved-workspace.json')));
  await page.goto('/#/decision');
  await expect(page.getByText(/Your saved work was made with model mpl-engine-1.0.0/)).toBeVisible();
  await openTab(page, 'compare');
  await expect(page.getByTestId('compare-table')).toContainText('Scenario 1');
  await openTab(page, 'notes');
  await expect(page.getByLabel('What I think changed')).toHaveValue('Lower rates raised refinancing (note written in model 1.0.0).');
  await page.goto('/#/lab');
  await expect(page.getByTestId('ctl-shock').locator('input[type=number]')).toHaveValue('-100');
});

test('saved work this version cannot open is kept and offered for download, not erased', async ({ page }) => {
  await seedSaved(page, { savedAt: '2026-01-01T00:00:00Z', file: JSON.stringify({ fileType: 'mortgage-prepayment-lab/scenarios', schemaVersion: 1, modelVersion: 'mpl-engine-9.0.0' }), started: true });
  await page.goto('/#/decision');
  await expect(page.getByText(/It has been kept, not deleted/)).toBeVisible();
  await openTab(page, 'files');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-backup').click()]);
  expect(readFileSync(await dl.path(), 'utf8')).toContain('mpl-engine-9.0.0');
});

test('exports carry the model version, the source build and a portfolio fingerprint that matches in every browser', async ({ page }) => {
  await startFresh(page);
  await page.goto('/#/decision');
  await openTab(page, 'files');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const f = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  expect(f.modelVersion).toBe('mpl-engine-1.1.0');
  expect(typeof f.appBuild).toBe('string');
  expect(f.portfolio.hash).toBe(MIXED_FINGERPRINT);
});
