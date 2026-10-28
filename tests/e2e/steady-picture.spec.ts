import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForDrawing } from './helpers.ts';

/**
 * On a phone the details are a sheet that takes room from the bottom of the stage. Opening a
 * verse must not turn the picture or rescale it: it keeps its size, the sheet covers its lower
 * part, and it slides up only as far as keeps the verse in sight.
 */
test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, 'Only a phone has the details sheet.');
});

/** Every canvas of a picture: the size it draws at, and the size it is shown at. */
async function canvasSizes(page: Page, canvases: string): Promise<string[]> {
  return page.locator(canvases).evaluateAll((elements: HTMLCanvasElement[]) =>
    elements.map((canvas) => {
      const shown = canvas.getBoundingClientRect();
      const drawn = `${String(canvas.width)}×${String(canvas.height)}`;
      return `${drawn} shown at ${String(Math.round(shown.width))}×${String(Math.round(shown.height))}`;
    }),
  );
}

/** Waits for the view's canvases to be sized to the stage (an unsized canvas is 300×150). */
async function waitForSizing(page: Page, picture: string): Promise<void> {
  await expect
    .poll(async () => page.locator(picture).evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .not.toBe(300);
}

/** Opens a verse from the search box, as a reader would, and waits for the sheet to settle. */
async function openVerse(page: Page, reference: string): Promise<void> {
  const search = page.locator(ACTIVE).getByRole('searchbox');
  await search.fill(reference);
  await search.press('Enter');
  await expect(page.locator(PANEL)).toBeVisible();
  await expect
    .poll(async () => page.locator(PANEL).evaluate((panel) => getComputedStyle(panel).transform))
    .toMatch(/^matrix\(1, 0, 0, 1, 0, [\d.]+\)$/);
  // The sheet's slide, and the picture's alongside it.
  await page.waitForTimeout(700);
}

test.describe('Arcs', () => {
  /** The arcs themselves: not the strip beside them, nor the tour's layer over them. */
  const PICTURE = `${ACTIVE} [role="application"] canvas`;
  const STRIP = `${ACTIVE} [role="slider"]`;

  test('keep their axis upright, and their size, when a verse opens', async ({ page }) => {
    await page.goto('./');
    await waitForDrawing(page);
    await waitForSizing(page, `${PICTURE} >> nth=0`);
    // The arcs, and the tour's layer over them, which keeps its card off the axis.
    const orientations = async () =>
      page
        .locator(`${ACTIVE} [data-orientation]`)
        .evaluateAll((elements) => elements.map((element) => element.dataset['orientation']));
    expect(await orientations()).toEqual(['vertical', 'vertical']);
    const before = await canvasSizes(page, PICTURE);

    await openVerse(page, 'Revelation 22:13');
    expect(await orientations()).toEqual(['vertical', 'vertical']);
    expect(await canvasSizes(page, PICTURE)).toEqual(before);

    // The end of the axis, where the verse is, has come up above the sheet.
    const sheet = await page.locator(PANEL).boundingBox();
    const stage = await page.locator(`${ACTIVE} [role="application"]`).boundingBox();
    expect((stage?.y ?? 0) + (stage?.height ?? 0)).toBeLessThan((sheet?.y ?? 0) + 40);
    // The strip beside it is the index of the whole Bible: all of it stays above the sheet.
    const strip = await page.locator(STRIP).boundingBox();
    expect((strip?.y ?? Infinity) + (strip?.height ?? 0)).toBeLessThanOrEqual((sheet?.y ?? 0) + 1);
  });
});

test.describe('Clusters', () => {
  const PICTURE = `${ACTIVE} canvas[role="img"]`;

  /** A fingerprint of the picture at rest, pixel for pixel. */
  async function pictureDigest(page: Page): Promise<string> {
    return page.locator(PICTURE).evaluate(async (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context) return '';
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    });
  }

  /** Where the white ring around the open verse is on screen, or `null` if it is not drawn. */
  async function ringOnScreen(page: Page): Promise<{ x: number; y: number } | null> {
    // Above the picture at rest: the canvas of what stands out.
    return page.locator(`${PICTURE} + canvas`).evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context) return null;
      const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
      let x = 0;
      let y = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255) {
          x += (i / 4) % width;
          y += Math.floor(i / 4 / width);
          count += 1;
        }
      }
      if (count === 0) return null;
      const box = canvas.getBoundingClientRect();
      const scale = box.width / canvas.width;
      return { x: box.left + (x / count) * scale, y: box.top + (y / count) * scale };
    });
  }

  test('keep their picture as it is when a verse opens, and slide it into sight', async ({
    page,
  }) => {
    await page.goto('./clusters/');
    await waitForDrawing(page);
    await waitForSizing(page, PICTURE);
    const sizes = await canvasSizes(page, `${ACTIVE} canvas`);
    const picture = await pictureDigest(page);
    let glided = false;
    await page.exposeFunction('noteGlide', () => {
      glided = true;
    });
    await page.locator(PICTURE).evaluate((canvas) => {
      const glide = canvas.previousElementSibling;
      if (!glide) throw new Error('No canvas for the glide');
      new MutationObserver(() => {
        (window as Window & { noteGlide?: () => void }).noteGlide?.();
      }).observe(glide, { attributeFilter: ['data-gliding'] });
    });

    // In the New Testament, the half the sheet comes up over.
    await openVerse(page, 'John 3:16');
    expect(await canvasSizes(page, `${ACTIVE} canvas`)).toEqual(sizes);
    expect(await pictureDigest(page)).toBe(picture);
    expect(glided).toBe(false);

    const ring = await ringOnScreen(page);
    const sheet = await page.locator(PANEL).boundingBox();
    const stage = await page.locator(`${ACTIVE} main`).boundingBox();
    expect(ring).not.toBeNull();
    expect(ring?.y ?? 0).toBeGreaterThan(stage?.y ?? 0);
    expect(ring?.y ?? Infinity).toBeLessThan(sheet?.y ?? 0);

    // Closed again, the picture slides back down, still as it was.
    await page.locator(PANEL).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator(PANEL)).toBeHidden();
    await expect
      .poll(async () => Math.round((await page.locator(PICTURE).boundingBox())?.y ?? 0))
      .toBe(Math.round(stage?.y ?? -1));
    expect(await pictureDigest(page)).toBe(picture);
    expect(glided).toBe(false);
  });
});
