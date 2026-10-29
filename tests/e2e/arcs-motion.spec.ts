import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, collectErrors, waitForApp, waitForDrawing } from './helpers.ts';

const STAGE = `${ACTIVE} [role="application"]`;

/** The part of the canon the arcs show: 0 is Genesis 1:1 and 1 the end of Revelation. */
interface CanonWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Reads the window off the minimap beside the axis, which writes it down as shares of the canon
 * each time the arcs are drawn; `null` while the whole canon shows.
 */
function readWindow(stage: Element | null): CanonWindow | null {
  const strip = stage?.parentElement?.querySelector<HTMLElement>('[role="slider"]');
  const start = Number(strip?.dataset['start']);
  const end = Number(strip?.dataset['end']);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 0.999) return null;
  return { start, end };
}

const shownWindow = (page: Page) => page.locator(STAGE).evaluate(readWindow);
// A frame where the strip can't be read (the stage was just resized, say) matches nothing.
const shownStart = async (page: Page) => (await shownWindow(page))?.start ?? Number.NaN;
const widthOf = (window: CanonWindow | null) => (window ? window.end - window.start : Number.NaN);

/** A frame of the page's clock, in ms. */
const FRAME_MS = 16;

/**
 * Does `go` with the page's clock held, then steps the clock a frame at a time until the camera
 * has landed at the end of the canon as zoomed in as `width`; resolves with the widest window it
 * showed on the way. A flight lasts well under a second, and its widest stretch a sixth of one,
 * while the software renderer CI draws with can take longer than that over one frame of a phone's
 * stage: watched in real time, the widest frames can all go undrawn. Stepped, every one is drawn,
 * and read. The page needs `page.clock.install()` before it loads.
 */
async function widestOnTheWayToTheEnd(
  page: Page,
  width: number,
  go: () => Promise<void>,
): Promise<number> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await go();
  let widest = 0;
  // Eight seconds of flight at most.
  for (let frame = 0; frame < 500; frame += 1) {
    await page.clock.runFor(FRAME_MS);
    const shown = await shownWindow(page);
    if (shown) widest = Math.max(widest, widthOf(shown));
    if (shown && shown.end > 0.99 && widthOf(shown) < width * 1.05) return widest;
  }
  throw new Error('The camera never landed.');
}

/** Zooms in around the middle with the stage's own keys, and waits for the view to settle. */
async function zoomIn(page: Page, steps: number): Promise<void> {
  await page.locator(STAGE).focus();
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('=');
  }
  await expect.poll(async () => (await shownWindow(page)) !== null).toBe(true);
  await page.waitForTimeout(400);
}

async function search(page: Page, reference: string): Promise<void> {
  const box = page.locator(ACTIVE).getByRole('searchbox');
  await box.fill(reference);
  await box.press('Enter');
}

/** A point `share` of the way along the stage's axis direction. */
async function alongStage(page: Page): Promise<(share: number) => { x: number; y: number }> {
  const stage = await page.locator(STAGE).boundingBox();
  if (!stage) throw new Error('The stage is not on screen.');
  const vertical = stage.height > stage.width * 1.15;
  return (share) =>
    vertical
      ? { x: stage.x + stage.width * 0.6, y: stage.y + stage.height * share }
      : { x: stage.x + stage.width * share, y: stage.y + stage.height * 0.4 };
}

/**
 * Only the best-rated links: what moves is the camera, whatever it shows, and fewer arcs keep the
 * software renderer CI draws them with up with a drag frame by frame.
 */
const FEW_LINKS = 'votes=50';

/**
 * Zoomed in a step (so the window starts a little way into the canon), drags from early on the
 * axis to late on it: the window pans back to Genesis, then would go past it. Returns a way to
 * carry on the same drag.
 */
async function dragTowardGenesis(page: Page): Promise<(share: number) => Promise<void>> {
  await zoomIn(page, 1);
  const along = await alongStage(page);
  const from = along(0.1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    const to = along(0.1 + step * 0.1);
    await page.mouse.move(to.x, to.y);
  }
  return async (share) => {
    const to = along(share);
    await page.mouse.move(to.x, to.y, { steps: 5 });
  };
}

test.describe('the arcs in motion', () => {
  test('the camera flies to a far passage, pulling back on the way, and lands on it', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.clock.install();
    await page.goto(`./?ref=Gen.2.4&${FEW_LINKS}`);
    await waitForApp(page);
    await zoomIn(page, 6);
    const width = widthOf(await shownWindow(page));
    expect(width).toBeLessThan(0.1);

    const widest = await widestOnTheWayToTheEnd(page, width, () => search(page, 'Rev 22:21'));
    // It pulls back to see both ends, rather than sliding across at one zoom...
    expect(widest).toBeGreaterThan(width * 3);
    // ...and lands as zoomed in as it set off.
    await expect.poll(async () => widthOf(await shownWindow(page))).toBeCloseTo(width, 2);
    expect(errors).toEqual([]);
  });

  test('arrow keys step the view a steady share of it, however quickly they come', async ({
    page,
  }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    await zoomIn(page, 5);
    const before = await shownWindow(page);
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('ArrowRight');
    }
    // Four steps of 15% each, each from where the last lands.
    await expect
      .poll(async () => ((await shownStart(page)) - (before?.start ?? 0)) / widthOf(before))
      .toBeCloseTo(0.6, 1);
  });

  test('a drag past Genesis resists, then springs back to it', async ({ page }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    await dragTowardGenesis(page);
    // Held past the start, by much less than the pointer went past it.
    const held = await shownStart(page);
    expect(held).toBeLessThan(0);
    expect(held).toBeGreaterThan(-0.3);
    await page.waitForTimeout(150); // Still before letting go, so it isn't flicked.
    await page.mouse.up();
    await expect.poll(() => shownStart(page), { timeout: 10_000 }).toBeCloseTo(0, 2);
  });
});

test.describe('the arcs in motion, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the camera cuts straight to a far passage, without flying', async ({ page }) => {
    await page.clock.install();
    await page.goto(`./?ref=Gen.2.4&${FEW_LINKS}`);
    await waitForApp(page);
    await zoomIn(page, 6);
    const width = widthOf(await shownWindow(page));

    const widest = await widestOnTheWayToTheEnd(page, width, () => search(page, 'Rev 22:21'));
    // Never the wide view of a flight: only where it was, then where it lands.
    expect(widest).toBeCloseTo(width, 2);
  });

  test('a drag stops at Genesis, without pulling past it', async ({ page }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const dragTo = await dragTowardGenesis(page);
    expect(await shownStart(page)).toBeCloseTo(0, 2);
    // The same drag pans the other way at once: nothing was held in reserve past the end.
    await dragTo(0.6);
    expect(await shownStart(page)).toBeGreaterThan(0.1);
    await page.mouse.up();
  });
});
