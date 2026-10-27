import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp, waitForDrawing } from './helpers.ts';

const STAGE = `${ACTIVE} [role="application"]`;
/** The strip of the whole Bible beside the axis. */
const STRIP = `${ACTIVE} [role="slider"]`;
/** What the strip says it lit up, to a screen reader. */
const LIT = `${STRIP} ~ [role="status"]`;

/**
 * Only the best-rated links: what is tested is where the window goes and what lights up, and fewer
 * arcs keep the software renderer CI draws them with up with a drag frame by frame.
 */
const FEW_LINKS = 'votes=50';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface CanonWindow {
  readonly start: number;
  readonly end: number;
}

/** The window as the strip last drew it, in shares of the canon (0 is Genesis 1:1). */
const shownWindow = (page: Page): Promise<CanonWindow> =>
  page.locator(STRIP).evaluate((strip: HTMLElement) => ({
    start: Number(strip.dataset['start']),
    end: Number(strip.dataset['end']),
  }));

/** Two frames: one for the input to be handled, one for what it changed to be drawn. */
const twoFrames = (page: Page) =>
  page.evaluate(
    async () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      }),
  );

/**
 * Where a share of the canon lies on the strip. Its track runs along the same pixels as the axis:
 * 32px in from either side, or 48px from the top and 16px from the foot of a phone's upright one.
 */
async function onStrip(page: Page): Promise<(share: number) => Point> {
  const strip = page.locator(STRIP);
  const box = await strip.boundingBox();
  if (!box) throw new Error('The strip is not on screen.');
  const vertical = (await strip.getAttribute('aria-orientation')) === 'vertical';
  return (share) =>
    vertical
      ? { x: box.x + box.width / 2, y: box.y + 48 + share * (box.height - 64) }
      : { x: box.x + 32 + share * (box.width - 64), y: box.y + box.height / 2 };
}

interface Press {
  readonly moveTo: (point: Point) => Promise<void>;
  readonly release: () => Promise<void>;
}

/**
 * Presses at `at`: a finger where the device has a touch screen, the mouse elsewhere. Playwright's
 * touchscreen only taps, so a finger that moves goes through the browser's own protocol.
 */
async function pressAt(page: Page, hasTouch: boolean, at: Point): Promise<Press> {
  if (!hasTouch) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    return {
      moveTo: (point) => page.mouse.move(point.x, point.y, { steps: 4 }),
      release: () => page.mouse.up(),
    };
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  let last = at;
  return {
    moveTo: async (point) => {
      for (let step = 1; step <= 4; step += 1) {
        const x = last.x + ((point.x - last.x) * step) / 4;
        const y = last.y + ((point.y - last.y) * step) / 4;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      }
      last = point;
    },
    release: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

async function tapAt(page: Page, hasTouch: boolean, at: Point): Promise<void> {
  if (hasTouch) {
    await page.touchscreen.tap(at.x, at.y);
  } else {
    await page.mouse.click(at.x, at.y);
  }
}

/** Zooms in about the middle with the strip's own keys, and waits for the window to land. */
async function zoomIn(page: Page, steps: number): Promise<CanonWindow> {
  await page.locator(STRIP).focus();
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('=');
  }
  const width = 1 / 1.6 ** steps;
  await expect
    .poll(async () => {
      const shown = await shownWindow(page);
      return shown.end - shown.start;
    })
    .toBeCloseTo(width, 4);
  return shownWindow(page);
}

/**
 * How many of the stage's pixels are bright. While a passage is open the glow is dimmed, so what
 * stands out of it is the links lit up on top.
 */
async function brightPixels(page: Page): Promise<number> {
  const picture = await page.locator(STAGE).screenshot();
  return page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas to read the picture with.');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) >= 160) bright += 1;
    }
    return bright;
  }, picture.toString('base64'));
}

test.describe('the minimap', () => {
  test('dragging the window moves the arcs with it, directly, and they stay where let go', async ({
    page,
    hasTouch,
  }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const before = await zoomIn(page, 3);
    const at = await onStrip(page);
    const middle = (before.start + before.end) / 2;

    const press = await pressAt(page, hasTouch, at(middle));
    await press.moveTo(at(middle + 0.1));
    await twoFrames(page);
    // Still held, and already under the pointer: nothing eases along behind it.
    const held = await shownWindow(page);
    expect(held.start).toBeCloseTo(before.start + 0.1, 2);
    expect(held.end - held.start).toBeCloseTo(before.end - before.start, 6);
    await press.release();

    await page.waitForTimeout(300);
    expect(await shownWindow(page)).toEqual(held);
  });

  test('dragging an edge of the window zooms, and the other edge stays put', async ({
    page,
    hasTouch,
  }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const before = await zoomIn(page, 3);
    const at = await onStrip(page);

    const press = await pressAt(page, hasTouch, at(before.end));
    await press.moveTo(at(before.end + 0.1));
    await press.release();
    const after = await shownWindow(page);
    expect(after.start).toBeCloseTo(before.start, 6);
    expect(after.end).toBeCloseTo(before.end + 0.1, 2);
  });

  test('dragging across books lights up their links; Escape, then a tap, clear them', async ({
    page,
    hasTouch,
  }) => {
    await page.goto(`./?ref=Ruth.1&${FEW_LINKS}`);
    await waitForApp(page);
    const quiet = await brightPixels(page);
    const at = await onStrip(page);

    // From Matthew (three quarters of the way along the canon) to John.
    const press = await pressAt(page, hasTouch, at(0.75));
    await press.moveTo(at(0.85));
    await press.release();
    await expect(page.locator(LIT)).toHaveText(/^Matthew – John lit up: [\d,]+ cross-references$/);
    await expect.poll(() => brightPixels(page)).toBeGreaterThan(quiet * 3);
    // The passage stays open: the books are lit up beside it, not in its place.
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Ruth 1' })).toBeVisible();

    // Escape on the stage puts away the lit books first, and only then the passage.
    await page.locator(STAGE).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator(LIT)).toHaveText('The books are no longer lit up');
    await expect.poll(() => brightPixels(page)).toBeLessThan(quiet * 2);
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Ruth 1' })).toBeVisible();

    // A tap on a book lights it up (Luke runs from 0.80 to 0.84 of the canon); another clears it.
    await tapAt(page, hasTouch, at(0.82));
    await expect(page.locator(LIT)).toHaveText(/^Luke lit up: /);
    await tapAt(page, hasTouch, at(0.82));
    await expect(page.locator(LIT)).toHaveText('The books are no longer lit up');
  });

  test('the keys move and zoom the window, light up the books in view, and clear them', async ({
    page,
  }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const strip = page.locator(STRIP);
    await expect(strip).toHaveAccessibleName('Whole Bible');
    await expect(strip).toHaveAttribute('aria-valuetext', 'Genesis – Revelation in view');

    const zoomed = await zoomIn(page, 2);
    await page.keyboard.press('Home');
    await expect.poll(async () => (await shownWindow(page)).start).toBe(0);
    await expect(strip).toHaveAttribute('aria-valuetext', /^Genesis – \S+ in view$/);

    await page.keyboard.press('Enter');
    await expect(page.locator(LIT)).toHaveText(/^Genesis – \S+ lit up: [\d,]+ cross-references$/);
    await page.keyboard.press('Escape');
    await expect(page.locator(LIT)).toHaveText('The books are no longer lit up');

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await shownWindow(page)).start)
      .toBeCloseTo((zoomed.end - zoomed.start) * 0.15, 4);
  });

  test('it says what is in view in the reader’s language', async ({ page }) => {
    await page.goto(`./?lang=pt&${FEW_LINKS}`);
    await waitForDrawing(page);
    await expect(page.locator(STRIP)).toHaveAttribute(
      'aria-valuetext',
      'Gênesis – Apocalipse em vista',
    );
    await page.goto(`./?lang=es&${FEW_LINKS}`);
    await waitForDrawing(page);
    await expect(page.locator(STRIP)).toHaveAttribute(
      'aria-valuetext',
      'Génesis – Apocalipsis a la vista',
    );
  });

  test('a finger has a target the size of a fingertip, however thin the strip looks', async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, 'A mouse needs no fingertip-sized target.');
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const box = await page.locator(STRIP).boundingBox();
    const vertical = (await page.locator(STRIP).getAttribute('aria-orientation')) === 'vertical';
    expect(vertical ? box?.width : box?.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('the minimap, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a key moves the window at once, and a drag moves it directly, as with motion', async ({
    page,
    hasTouch,
  }) => {
    await page.goto(`./?${FEW_LINKS}`);
    await waitForDrawing(page);
    const before = await zoomIn(page, 3);
    await page.keyboard.press('ArrowRight');
    await twoFrames(page);
    const stepped = await shownWindow(page);
    expect(stepped.start).toBeCloseTo(before.start + (before.end - before.start) * 0.15, 4);

    const at = await onStrip(page);
    const middle = (stepped.start + stepped.end) / 2;
    const press = await pressAt(page, hasTouch, at(middle));
    await press.moveTo(at(middle - 0.1));
    await twoFrames(page);
    expect((await shownWindow(page)).start).toBeCloseTo(stepped.start - 0.1, 2);
    await press.release();
  });
});
