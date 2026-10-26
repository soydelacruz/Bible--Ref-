import { expect, test } from '@playwright/test';
import { ACTIVE, PANEL, openPassage, waitForApp, openHeaderMenu, headerButton } from './helpers.ts';

test.describe('translations', () => {
  test('the text changes when another translation is chosen, and the address says which', async ({
    page,
  }) => {
    await openPassage(page, 'John.3.16');
    await expect(page.locator(PANEL)).toContainText(/one and only Son/);

    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();

    await expect(page).toHaveURL(/t=kjv/);
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
  });

  test('a shared address opens in the translation it names', async ({ page }) => {
    await openPassage(page, 'John.3.16', '&t=kjv');
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
    await expect(await headerButton(page, /Translation/)).toContainText('KJV');
  });

  test('the choice is remembered for the next visit', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();
    await expect(page).toHaveURL(/t=kjv/);

    await page.goto('./');
    await waitForApp(page);
    await expect(await headerButton(page, /Translation/)).toContainText('KJV');
  });

  test('the credit in the footer follows the translation on screen', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await expect(page.locator(`${ACTIVE} footer`)).toContainText('BSB');
  });

  test('a quote is copied with its reference and a link that names the translation', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPassage(page, 'Ps.23.1');
    await page.locator(PANEL).getByRole('button', { name: /^Copy/ }).first().click();
    // Writing to the clipboard is asynchronous, and the panel says so when it has finished:
    // reading before that is a race, which is a slow machine away from an empty string.
    await expect(page.locator(PANEL).getByRole('status').first()).toHaveText(/copied/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Psalm 23:1');
    expect(copied).toContain('(BSB)');
    expect(copied).toContain('?ref=Ps.23.1&t=bsb');
  });
});
