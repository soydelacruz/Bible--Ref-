import { expect, test } from '@playwright/test';
import { ACTIVE, PANEL, collectErrors, openPassage, waitForApp } from './helpers.ts';

test.describe('reading the Bible', () => {
  test('the arcs are drawn, and say how much is shown', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitForApp(page);
    await expect(page.locator(`${ACTIVE} canvas`).first()).toBeVisible();
    await expect(page.getByText(/31,102 verses/)).toBeVisible();
    await expect(page.getByText(/of 344,799 links shown/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a verse can be found by typing its reference', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await page.locator(ACTIVE).getByRole('searchbox').fill('Ps 23:1');
    await page.locator(ACTIVE).getByRole('searchbox').press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Psalm 23:1' })).toBeVisible();
    await expect(page).toHaveURL(/ref=Ps\.23\.1/);
  });

  test('a whole chapter can be opened, and lists its verses', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await page.locator(ACTIVE).getByRole('searchbox').fill('Psalm 23');
    await page.locator(ACTIVE).getByRole('searchbox').press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Psalm 23' })).toBeVisible();
    await expect(page.locator(PANEL).getByRole('button', { name: /Verses/ })).toBeVisible();
  });

  test('a reference that is not a reference says so, and changes nothing', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await page.locator(ACTIVE).getByRole('searchbox').fill('Hesitations 4:4');
    await page.locator(ACTIVE).getByRole('searchbox').press('Enter');
    await expect(page.locator(ACTIVE).getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/ref=/);
  });

  test('a shared address opens exactly the passage it names', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    await expect(page.locator(PANEL)).toContainText(/For God so loved the world/);
  });

  test('the panel steps to the next verse and back', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await page.locator(PANEL).getByRole('button', { name: 'Next verse' }).click();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:17' })).toBeVisible();
    await page.locator(PANEL).getByRole('button', { name: 'Previous verse' }).click();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
  });

  test('the panel closes', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await page.locator(PANEL).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator(PANEL)).toHaveCount(0);
  });

  test('a cross-reference can be followed to where it leads', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    const link = page
      .locator(PANEL)
      .getByRole('button', { name: /^Romans 5:8/ })
      .first();
    await link.click();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Romans 5:8' })).toBeVisible();
    await expect(page).toHaveURL(/ref=Rom\.5\.8/);
  });

  test('the keyboard follows a cross-reference, and lands on the title it leads to', async ({
    page,
  }) => {
    await openPassage(page, 'John.3.16');
    await page
      .locator(PANEL)
      .getByRole('button', { name: /^Romans 5:8/ })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Romans 5:8' })).toBeFocused();
    // From there the keyboard carries on through the panel, not from the top of the page.
    await page.keyboard.press('Tab');
    await expect(page.locator(PANEL).getByRole('button', { name: 'Previous verse' })).toBeFocused();
  });

  test('a search lands on the passage title, and closing goes back to the search', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForApp(page);
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Ps 23:1');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Psalm 23:1' })).toBeFocused();
    await page.locator(PANEL).getByRole('button', { name: 'Close', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(search).toBeFocused();
  });

  test('Back returns to the passage before it', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await page.locator(ACTIVE).getByRole('searchbox').fill('Ps 23:1');
    await page.locator(ACTIVE).getByRole('searchbox').press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Psalm 23:1' })).toBeVisible();
    await page.goBack();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
  });

  test('the two views switch, keeping the passage', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }).click();
    await expect(page).toHaveURL(/threads\//);
    await expect(page).toHaveURL(/ref=John\.3\.16/);
    await page.locator(ACTIVE).getByRole('link', { name: 'Arcs', exact: true }).click();
    await expect(page).toHaveURL(/ref=John\.3\.16/);
  });
});
