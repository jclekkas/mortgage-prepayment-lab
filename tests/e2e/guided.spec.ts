import { expect, test } from '@playwright/test';

async function clearStorage(page: import('@playwright/test').Page) {
  await page.goto('/#/start');
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mortgage-prepayment-lab'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto('/#/start');
}

test('guided experiment teaches, asks for a prediction, then shows baseline, rate cut and difference', async ({ page }) => {
  await clearStorage(page);
  await expect(page.getByTestId('restart-warning')).toHaveCount(0);
  await page.getByTestId('preset-mixed').click();
  await page.getByTestId('start-guided').click();

  // Step 1: roles, before any question.
  await expect(page.getByRole('heading', { name: 'Three parties, one mortgage' })).toBeFocused();
  await expect(page.getByTestId('guided')).toContainText('The servicer does not own the loan');
  await expect(page.getByTestId('guided')).toContainText('The servicer’s fee on it stops');
  await expect(page.getByTestId('guided-skip')).toHaveAttribute('href', '#/overview');
  await page.getByTestId('guided-next').click();

  // Step 2: the starting assumptions are shown, with no seed or jargon-only labels.
  const a = page.getByTestId('guided-assumptions');
  await expect(a).toContainText('Borrowers’ existing mortgage rates');
  await expect(a).toContainText('0.25% of each loan’s balance a year');
  await expect(a).toContainText('$100 per active loan a year');
  await expect(a).toContainText('10% a year');
  await expect(page.getByTestId('guided')).not.toContainText('seed');
  await page.getByTestId('guided-next').click();

  // Step 3: the rate cut is described before the prediction; all three answers are required.
  await expect(page.getByTestId('guided')).toContainText('drops from 6.25% to 5.25%');
  const apply = page.getByTestId('guided-apply');
  await expect(apply).toBeDisabled();
  // Keyboard: focus a radio and select it with Space.
  await page.getByTestId('guess-cpr-up').focus();
  await page.keyboard.press('Space');
  await page.getByTestId('guess-net12-up').check();
  await expect(apply).toBeDisabled();
  await page.getByTestId('guess-npv-up').check();
  await expect(apply).toBeEnabled();
  await apply.click();

  // Step 4: baseline, scenario and difference for each of the three outcomes, plus reasoning.
  await expect(page.getByTestId('guided-result')).toBeVisible();
  const cpr = page.getByTestId('guided-row-cpr');
  await expect(cpr).toContainText('faster');
  await expect(cpr).toContainText('Matches (up)');
  const net = page.getByTestId('guided-row-net12');
  await expect(net).toContainText('You said up; it went down');
  const npv = page.getByTestId('guided-row-npv');
  await expect(npv).toContainText('You said up; it went down');
  await expect(npv).toContainText('lower');
  await expect(page.getByTestId('guided-headline')).not.toBeEmpty();
  await expect(page.getByTestId('guided-takeaway')).toContainText('not a rule');
  await expect(page.getByTestId('guided-result').getByTestId('trust-note')).toContainText('Real-world accuracy not established');

  // The guided run did not touch the learner's scenarios until they choose to add it.
  const options = page.getByLabel('Active scenario').locator('option');
  await expect(options).toHaveCount(2);
  await page.getByTestId('guided-add').click();
  await expect(options).toHaveCount(3);
  await expect(page.getByTestId('guided-result')).toContainText('your other scenarios were not changed');

  // The dashboard's baseline matches the guided baseline (same calculation, same population).
  const guidedBaseNpv = (await npv.locator('td').nth(0).textContent())!.trim();
  await page.getByTestId('guided-done').click();
  await page.getByLabel('Active scenario').selectOption({ index: 0 });
  await expect(page.getByTestId('kpi-npv-value')).toHaveText(guidedBaseNpv);
});

test('start page warns before replacing work, and the header offers a way back to change portfolio', async ({ page }) => {
  await clearStorage(page);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('kpi-npv-value')).toBeVisible();
  await page.getByTestId('change-portfolio').click();
  await expect(page.getByTestId('restart-warning')).toContainText('Starting again replaces those scenarios');
  await expect(page.getByTestId('restart-warning')).toContainText('2 scenarios');
});

test('guided experiment is reachable from Learn and the dashboard', async ({ page }) => {
  await clearStorage(page);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('overview-guided')).toHaveAttribute('href', '#/guided');
  await page.goto('/#/learn');
  await page.getByTestId('learn-guided').click();
  await expect(page.getByRole('heading', { name: 'Three parties, one mortgage' })).toBeVisible();
});
