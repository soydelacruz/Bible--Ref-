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
    // What is on screen stays there as the words arrive. Threads is first drawn at that moment,
    // and while its code started the whole page once went back to the loading screen.
    await page.evaluate(() => {
      const view = document.querySelector<HTMLElement>('div[data-active="true"]');
      const record = window as unknown as { viewHidden?: boolean };
      record.viewHidden = false;
      if (view) {
        new MutationObserver(() => {
          record.viewHidden ||= view.style.display === 'none';
        }).observe(view, { attributes: true, attributeFilter: ['style'] });
      }
    });

    release();
    await expect(page.locator(PANEL)).toContainText(/For God so loved the world/);
    await expect(page.locator(`${PANEL} ${PENDING}`)).toHaveCount(0);
    // Threads, hidden, is drawn once the words are in: give it the moment it takes.
    await page.waitForTimeout(1000);
    expect(
      await page.evaluate(() => (window as unknown as { viewHidden?: boolean }).viewHidden),
    ).toBe(false);
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
