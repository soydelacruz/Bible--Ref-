import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, collectErrors, waitForDrawing } from './helpers.ts';

/**
 * The arcs' guided tour: offered once to a first-time visitor, and from the arcs' own controls
 * after that; it flies from famous link to famous link with a card for each, pauses, and ends
 * where it is, leaving the reader at the passage it was showing.
 */

const card = (page: Page) => page.locator(ACTIVE).getByRole('region', { name: 'Guided tour' });
/** The card's first line, e.g. "Tour · 2 of 6", with " · Paused" while it is. */
const progress = (page: Page) => card(page).locator('p').first();

/** The passage in the address, e.g. `Gen.1.1`; `null` for none. */
const passageInAddress = (page: Page) => new URL(page.url()).searchParams.get('ref');

/**
 * Starts the tour from the arcs' controls: the end of the hint line on a wide screen, a row of
 * the More menu on a phone, where the hint line has no room for it.
 */
async function startFromControls(page: Page): Promise<void> {
  const active = page.locator(ACTIVE);
  const more = active.getByRole('button', { name: /^More\b/ });
  if (await more.isVisible()) {
    await more.click();
  }
  await active.getByRole('button', { name: 'Take the tour' }).click();
}

test.describe('The arcs’ tour', () => {
  test('is offered on a first visit, plays, pauses, resumes, and closes where it is', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitForDrawing(page);
    await card(page).getByRole('button', { name: 'Take the tour' }).click();

    await expect(progress(page)).toHaveText('Tour · 1 of 6');
    await expect(card(page).getByRole('heading', { name: 'In the beginning' })).toBeVisible();
    await expect(card(page)).toContainText('Genesis 1:1 → John 1:1');
    // The reader's keys go to the tour's own controls, and the address is left alone.
    const pause = card(page).getByRole('button', { name: 'Pause the tour' });
    await expect(pause).toBeFocused();
    expect(passageInAddress(page)).toBeNull();

    await pause.click();
    await expect(progress(page)).toHaveText('Tour · 1 of 6 · Paused');
    // A stop lasts under seven seconds; paused, the first one stays.
    await page.waitForTimeout(8000);
    await expect(progress(page)).toHaveText('Tour · 1 of 6 · Paused');

    await card(page).getByRole('button', { name: 'Resume the tour' }).click();
    await expect(progress(page)).toHaveText('Tour · 2 of 6', { timeout: 10_000 });
    await expect(card(page).getByRole('heading', { name: 'Hear, O Israel' })).toBeVisible();

    await card(page).getByRole('button', { name: 'End the tour' }).click();
    await expect(card(page)).toBeHidden();
    // Left at the stop it was showing, with its details open and the arcs taking the keys.
    await expect.poll(() => passageInAddress(page)).toBe('Deut.6.4');
    await expect(
      page.locator(PANEL).getByRole('heading', { name: 'Deuteronomy 6:4' }),
    ).toBeVisible();
    await expect(page.locator(`${ACTIVE} [role="application"]`)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('is offered only once, stays at hand among the arcs’ controls, and ends at Escape', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForDrawing(page);
    await card(page).getByRole('button', { name: 'Not now' }).click();
    await expect(card(page)).toBeHidden();

    await page.reload();
    await waitForDrawing(page);
    // The invitation shows a moment after the arcs have unfolded; by now it would have.
    await page.waitForTimeout(2000);
    await expect(card(page)).toBeHidden();

    await startFromControls(page);
    await expect(progress(page)).toHaveText('Tour · 1 of 6');
    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    await expect.poll(() => passageInAddress(page)).toBe('Gen.1.1');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Genesis 1:1' })).toBeVisible();
  });

  test('ends at a touch of the arcs, leaving the reader free to explore from its stop', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForDrawing(page);
    await card(page).getByRole('button', { name: 'Take the tour' }).click();
    await expect(progress(page)).toHaveText('Tour · 1 of 6');

    const stage = await page.locator(`${ACTIVE} [role="application"]`).boundingBox();
    if (!stage) throw new Error('The arcs are not on screen');
    // A drag, not a tap: nothing is chosen, so the tour's own stop is handed back.
    await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5);
    await page.mouse.down();
    await expect(card(page)).toBeHidden();
    await page.mouse.move(stage.x + stage.width * 0.45, stage.y + stage.height * 0.45, {
      steps: 4,
    });
    await page.mouse.up();
    await expect.poll(() => passageInAddress(page)).toBe('Gen.1.1');
  });
});
