import { expect, test, type Page } from '@playwright/test';
import {
  ACTIVE,
  PANEL,
  collectErrors,
  openHeaderMenu,
  waitForApp,
  waitForDrawing,
} from './helpers.ts';

/**
 * The first visit's Start here strip: one line on what the picture is, and three ways in — John
 * 3:16 in the arcs, Psalm 23 in the threads, and the arcs' tour. It shows on the front page of a
 * first visit only, in a row of its own under the header, and once closed or gone through it
 * never comes back. While it shows, it is what offers the tour: the tour's own invitation stands
 * down.
 */

const strip = (page: Page) => page.locator(ACTIVE).getByRole('region', { name: 'Start here' });
const tourCard = (page: Page) => page.locator(ACTIVE).getByRole('region', { name: 'Guided tour' });
const closeButton = (page: Page) =>
  strip(page).getByRole('button', { name: 'Don’t show this again' });
/** The passage in the address, e.g. `John.3.16`; `null` for none. */
const passageInAddress = (page: Page) => new URL(page.url()).searchParams.get('ref');

/** Opens the front page as a first-time reader finds it, the strip on screen. */
async function firstVisit(page: Page): Promise<void> {
  await page.goto('./');
  await waitForDrawing(page);
  await expect(strip(page)).toBeVisible();
}

test.describe('Start here', () => {
  test('welcomes a first visit under the header, clear of the arcs, and is reached by keys', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await firstVisit(page);
    await expect(strip(page)).toContainText(
      'Each arc joins two passages that refer to each other, coloured by the genre of their books.',
    );

    // A row of its own: the stage, and every arc on it, starts below it.
    const box = await strip(page).boundingBox();
    const stage = await page.locator(`${ACTIVE} main`).boundingBox();
    if (!box || !stage) throw new Error('The strip or the stage is not on screen');
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 0.5);

    // It offers the tour, so the tour's own invitation does not show beside it. That one appears
    // a moment after the arcs have unfolded; by now it would have.
    await page.waitForTimeout(2000);
    await expect(tourCard(page)).toBeHidden();

    // Between the header and the arcs for the keys too: one step back from the arcs is its close.
    await page.locator(`${ACTIVE} [role="application"]`).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(closeButton(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('stays while the reader tries the filters, so nothing moves under the pointer', async ({
    page,
  }) => {
    await firstVisit(page);
    // The legend is the Genres menu, in the header (in More on a phone).
    await openHeaderMenu(page, /^Genres/);
    const law = page.locator(ACTIVE).getByRole('button', { name: /^Law/ }).first();
    const before = await law.boundingBox();
    await law.click();
    await expect(law).toHaveAttribute('aria-pressed', 'false');
    await expect(strip(page)).toBeVisible();
    expect((await law.boundingBox())?.y).toBe(before?.y);
  });

  test('opens John 3:16 in the arcs, and is done for good', async ({ page }) => {
    await firstVisit(page);
    await strip(page).getByRole('link', { name: 'John 3:16 in Arcs' }).click();
    await expect(page.locator(ACTIVE)).toHaveAttribute('data-view', 'arcs');
    await expect.poll(() => passageInAddress(page)).toBe('John.3.16');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    // The keys go to the passage, as after a search.
    await expect(page.locator(`${PANEL} [data-panel-title]`)).toBeFocused();
    await expect(strip(page)).toBeHidden();

    // Back on the front page, the welcome is over.
    await page.goBack();
    await expect.poll(() => passageInAddress(page)).toBeNull();
    await expect(strip(page)).toBeHidden();
  });

  test('opens Psalm 23 in the threads', async ({ page }) => {
    await firstVisit(page);
    await strip(page).getByRole('link', { name: 'Psalm 23 in Threads' }).click();
    await expect(page.locator(ACTIVE)).toHaveAttribute('data-view', 'threads');
    await expect(page).toHaveURL(/\/threads\/\?ref=Ps\.23$/);
    await waitForApp(page);
    // A chapter reads in the threads' own pane, verse by verse.
    const reading = page.locator(`${ACTIVE} main`);
    await expect(reading.getByRole('heading', { name: 'Psalms 23' })).toBeVisible();
    await expect(reading).toContainText('The LORD is my shepherd');
    // The keys follow into the view, as they do from the switch.
    await expect(page.locator(`${ACTIVE} [aria-current="page"]`)).toBeFocused();
    await expect(strip(page)).toBeHidden();
  });

  test('starts the arcs’ tour, after which neither it nor the tour’s invitation comes back', async ({
    page,
  }) => {
    await firstVisit(page);
    await strip(page).getByRole('button', { name: 'The tour in 45 seconds' }).click();
    await expect(tourCard(page).locator('p').first()).toHaveText(/^Tour · 1 of 6$/);
    await expect(tourCard(page).getByRole('button', { name: 'Pause the tour' })).toBeFocused();
    await expect(strip(page)).toBeHidden();
    // Its address stays the front page's while it plays; the strip does not come back to it.
    expect(passageInAddress(page)).toBeNull();
    // Ended at once: it flies all the time, at every link, which a software renderer is slow at.
    await page.keyboard.press('Escape');
    await expect(tourCard(page)).toBeHidden();

    await page.reload();
    await waitForDrawing(page);
    await page.waitForTimeout(2000);
    await expect(strip(page)).toBeHidden();
    await expect(tourCard(page)).toBeHidden();
  });

  test('stays across a reload until it is closed, and never comes back', async ({ page }) => {
    await firstVisit(page);
    await page.reload();
    await waitForDrawing(page);
    await expect(strip(page)).toBeVisible();

    await closeButton(page).click();
    await expect(strip(page)).toBeHidden();
    // Its button gone, the keys go on to the arcs that were under it.
    await expect(page.locator(`${ACTIVE} [role="application"]`)).toBeFocused();

    await page.reload();
    await waitForDrawing(page);
    await page.waitForTimeout(2000);
    await expect(strip(page)).toBeHidden();
    // Nor does the tour's own invitation take its place: the reader has been offered the tour.
    await expect(tourCard(page)).toBeHidden();
  });

  test('does not show for a link to somewhere in particular, nor to a returning reader', async ({
    page,
  }) => {
    // A passage, another view, another filter: a link someone shared, not the front page.
    for (const address of ['./threads/', './?votes=50', './?ref=Gen.1.1']) {
      await page.goto(address);
      await waitForDrawing(page);
      await expect(strip(page)).toBeHidden();
    }
    // Not even once that reader closes the passage and stands on the front page.
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Genesis 1:1' })).toBeVisible();
    await page.locator(PANEL).getByRole('button', { name: 'Close' }).click();
    await expect.poll(() => passageInAddress(page)).toBeNull();
    await expect(strip(page)).toBeHidden();

    // A reader with anything stored has been here before.
    await page.evaluate(() => {
      localStorage.setItem('bible-cross-references:locale', 'en');
    });
    await page.goto('./');
    await waitForDrawing(page);
    await expect(strip(page)).toBeHidden();
  });

  test('speaks the reader’s language', async ({ page }) => {
    await page.goto('./?lang=pt');
    await waitForDrawing(page);
    const welcome = page.locator(ACTIVE).getByRole('region', { name: 'Comece aqui' });
    await expect(welcome.getByRole('link', { name: 'João 3:16 nos Arcos' })).toBeVisible();
    await expect(welcome.getByRole('link', { name: 'Salmo 23 nos Fios' })).toBeVisible();
    await expect(welcome.getByRole('button', { name: 'O passeio em 45 segundos' })).toBeVisible();
  });
});
