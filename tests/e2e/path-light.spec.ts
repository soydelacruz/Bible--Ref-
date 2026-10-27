import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, collectErrors, openPanel, waitForApp } from './helpers.ts';

/**
 * A path found in the details panel is drawn on the picture beside it: light travels the chain hop
 * by hop, the panel lights each step as the light heads for it, and the whole chain stays drawn.
 */

/** Opens a passage in a view, with its details in full view. */
async function open(page: Page, view: '' | 'clusters/', ref: string): Promise<void> {
  await page.goto(`./${view}?ref=${ref}`);
  await waitForApp(page);
  await openPanel(page);
}

async function findPathTo(page: Page, reference: string): Promise<void> {
  const panel = page.locator(PANEL);
  await panel.getByRole('textbox', { name: 'Passage to find a path to' }).fill(reference);
  await panel.getByRole('button', { name: 'Find path', exact: true }).click();
}

/** The chain's own list, not the panel's other lists (the study links, for one). */
function chainSteps(page: Page) {
  return page
    .locator(PANEL)
    .getByRole('list')
    .filter({ hasText: 'Ruth 1:16' })
    .filter({ hasText: 'John 3:16' })
    .getByRole('listitem');
}

/**
 * Records, from now on, which steps of the panel's path are lit each time that changes: the
 * light moves on every quarter of a second, quicker than an assertion would look.
 */
async function recordLitSteps(page: Page): Promise<void> {
  await page.locator(PANEL).evaluate((panel) => {
    const seen: string[][] = [];
    Object.assign(window, { litSteps: seen });
    new MutationObserver(() => {
      const lit = [...panel.querySelectorAll('li[data-lit] strong')].map(
        (name) => name.textContent,
      );
      if (JSON.stringify(seen.at(-1) ?? []) !== JSON.stringify(lit)) seen.push(lit);
    }).observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-lit'],
    });
  });
}

function litStepsSeen(page: Page): Promise<string[][]> {
  return page.evaluate(() => (window as unknown as { litSteps: string[][] }).litSteps);
}

/** How much of the view's path layer is painted, in pixels. */
function pathPixels(page: Page): Promise<number> {
  return page.locator(`${ACTIVE} canvas[data-path-light]`).evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let alpha = 3; alpha < data.length; alpha += 4) {
      if ((data[alpha] ?? 0) > 0) painted += 1;
    }
    return painted;
  });
}

async function stepNames(page: Page): Promise<string[]> {
  return (await chainSteps(page).locator('strong').allTextContents()).map((name) => name.trim());
}

for (const [name, view] of [
  ['Arcs', ''],
  ['Clusters', 'clusters/'],
] as const) {
  test.describe(`the path in ${name}`, () => {
    test('travels as light, lighting each step in turn, and stays drawn', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, view, 'Ruth.1.16');
      expect(await pathPixels(page)).toBe(0);
      await recordLitSteps(page);
      await findPathTo(page, 'John 3:16');
      await expect(chainSteps(page).last()).toContainText('John 3:16');
      const names = await stepNames(page);

      // Every step after the first lights up on its own, in the chain's order, and then none is.
      const inTurn = names.slice(1).map((step) => [step]);
      const litInTurn = async () => (await litStepsSeen(page)).filter((lit) => lit.length > 0);
      await expect.poll(litInTurn, { timeout: 20_000 }).toEqual(inTurn);
      await expect(page.locator(PANEL).locator('li[data-lit]')).toHaveCount(0);
      expect(await pathPixels(page)).toBeGreaterThan(200);

      // Played again on request, the same way; cleared, it is gone from the picture.
      await page.evaluate(() => {
        (window as unknown as { litSteps: string[][] }).litSteps.length = 0;
      });
      await page.locator(PANEL).getByRole('button', { name: 'Play again' }).click();
      await expect.poll(litInTurn, { timeout: 20_000 }).toEqual(inTurn);
      await page.locator(PANEL).getByRole('button', { name: 'Clear path' }).click();
      await expect.poll(() => pathPixels(page)).toBe(0);
      expect(errors).toEqual([]);
    });

    test.describe('with reduced motion', () => {
      test.use({ reducedMotion: 'reduce' });

      test('is drawn whole at once, with every step lit together', async ({ page }) => {
        await open(page, view, 'Ruth.1.16');
        await recordLitSteps(page);
        await findPathTo(page, 'John 3:16');
        await expect(chainSteps(page).last()).toContainText('John 3:16');
        expect(await pathPixels(page)).toBeGreaterThan(200);
        const names = await stepNames(page);

        // Lit all together, for as long as the light would have taken, and then none.
        await expect.poll(async () => (await litStepsSeen(page)).length).toBeGreaterThan(0);
        await expect(page.locator(PANEL).locator('li[data-lit]')).toHaveCount(0);
        const lit = (await litStepsSeen(page)).filter((steps) => steps.length > 0);
        expect(lit).toEqual([names]);
        expect(await pathPixels(page)).toBeGreaterThan(200);
      });
    });
  });
}
