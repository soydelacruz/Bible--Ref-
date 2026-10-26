import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForDrawing } from './helpers.ts';

/** The placeholder that stands in for the words while they download. */
const PENDING = '[data-text-pending]';

/**
 * Holds every request for a translation's text until the returned function is called, as a slow
 * connection would: the links arrive, the words do not yet.
 */
async function holdTheText(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/translations/**', async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

test.describe('loading', () => {
  test('the arcs are drawn before the text arrives, and the panel waits for it in place', async ({
    page,
  }) => {
    const release = await holdTheText(page);
    await page.goto('./?ref=John.3.16');
    await waitForDrawing(page);
    // Drawn from the links alone; only the words wait, inside the panel.
    await expect(page.locator(`${PANEL} ${PENDING}`)).toHaveText('Loading the text…');
    await expect(page.locator(`${ACTIVE} footer`)).toContainText('BSB');

    release();
    await expect(page.locator(PANEL)).toContainText(/For God so loved the world/);
    await expect(page.locator(`${PANEL} ${PENDING}`)).toHaveCount(0);
  });

  test('a page made of words waits inside its own frame, one switch from the arcs', async ({
    page,
  }) => {
    const release = await holdTheText(page);
    await page.goto('./threads/');
    // The links come first (the loading screen meanwhile); then the frame, waiting for words.
    await page.locator(`${ACTIVE} ${PENDING}`).waitFor();
    await expect(page.locator(`${ACTIVE} ${PENDING}`)).toHaveText('Loading the text…');
    // The masthead is there while the words are not, and the arcs need none of them.
    await page.locator(ACTIVE).getByRole('link', { name: /Arcs/ }).first().click();
    await waitForDrawing(page);

    release();
    await page.goBack();
    await expect(page.locator(ACTIVE)).toContainText(/In the beginning was the Word/);
  });

  test('a text that fails to download says so where it would be, and comes back on retry', async ({
    page,
  }) => {
    await page.route('**/data/translations/**', (route) => route.abort());
    await page.goto('./?ref=John.3.16');
    await waitForDrawing(page);
    await expect(page.locator(PANEL).getByRole('alert')).toContainText(/could not be loaded/);

    await page.unroute('**/data/translations/**');
    await page.locator(PANEL).getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator(PANEL)).toContainText(/For God so loved the world/);
  });
});
