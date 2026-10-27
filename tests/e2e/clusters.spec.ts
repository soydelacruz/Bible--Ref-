import { expect, test, type Locator, type Page } from '@playwright/test';
import { ACTIVE, waitForDrawing } from './helpers.ts';

/** The picture at rest: the canvas a screen reader is told about. */
const PICTURE = `${ACTIVE} canvas[role="img"]`;

interface GlideChange {
  readonly gliding: boolean;
  readonly at: number;
}

/** The page's window, with the glides noted by `watchGlides`. */
type WatchedWindow = Window & { glideChanges?: GlideChange[] };

/** Opens Clusters and waits for its picture to be drawn (its canvas sized to the stage). */
async function openClusters(page: Page): Promise<void> {
  await page.goto('./clusters/');
  await waitForDrawing(page);
  await expect
    .poll(async () => page.locator(PICTURE).evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .not.toBe(300);
}

/**
 * One of the view's own controls (the book picker, the tour): on the stage's toolbar on a desktop,
 * in the header's More menu on a phone, which is opened first if it is not open already.
 */
async function viewControl(page: Page, control: Locator): Promise<Locator> {
  if (!(await control.isVisible())) {
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /^More\b/ })
      .click();
  }
  return control;
}

async function chooseBook(page: Page, book: string): Promise<void> {
  const picker = page.locator(ACTIVE).getByRole('combobox', { name: 'Book' });
  await (await viewControl(page, picker)).selectOption({ label: book });
}

/**
 * From now on, notes every time the dots start or stop gliding. The gliding dots are drawn on a
 * canvas of their own, under the picture, marked while they move.
 */
async function watchGlides(page: Page): Promise<void> {
  await page.locator(PICTURE).evaluate((picture) => {
    const glide = picture.previousElementSibling;
    if (!glide) throw new Error('No canvas for the glide');
    const changes: GlideChange[] = [];
    (window as WatchedWindow).glideChanges = changes;
    new MutationObserver(() => {
      changes.push({ gliding: glide.hasAttribute('data-gliding'), at: performance.now() });
    }).observe(glide, { attributeFilter: ['data-gliding'] });
  });
}

async function glideChanges(page: Page): Promise<GlideChange[]> {
  return page.evaluate(() => (window as WatchedWindow).glideChanges ?? []);
}

/** Waits for a glide that has started to land. */
async function waitForLanding(page: Page): Promise<GlideChange[]> {
  await expect
    .poll(async () => (await glideChanges(page)).at(-1)?.gliding, { timeout: 15_000 })
    .toBe(false);
  return glideChanges(page);
}

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

test.describe('the clusters glide between pictures', () => {
  test('opening a book glides the dots there, rather than jumping', async ({ page }) => {
    await openClusters(page);
    await watchGlides(page);
    await chooseBook(page, 'Psalms');
    const changes = await waitForLanding(page);
    const started = changes.find((change) => change.gliding);
    const ended = changes.at(-1);
    expect(started).toBeDefined();
    // Over time, frame by frame: a jump would start and stop in the same moment.
    expect((ended?.at ?? 0) - (started?.at ?? 0)).toBeGreaterThanOrEqual(300);

    // And back again when the book is closed.
    await watchGlides(page);
    await page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' }).click();
    expect((await waitForLanding(page)).some((change) => change.gliding)).toBe(true);
  });

  test('a reader who asked for less motion sees the book open at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClusters(page);
    await watchGlides(page);
    await chooseBook(page, 'Psalms');
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeVisible();
    // Give a glide every chance to begin; none does.
    await page.waitForTimeout(800);
    expect(await glideChanges(page)).toEqual([]);
  });

  test('the glide lands on exactly the picture drawn without one', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClusters(page);
    await chooseBook(page, 'Isaiah');
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeVisible();
    const still = await pictureDigest(page);
    await page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' }).click();
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeHidden();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await watchGlides(page);
    await chooseBook(page, 'Isaiah');
    await waitForLanding(page);
    await expect.poll(async () => pictureDigest(page)).toBe(still);
  });

  test('a glide cut short by another still lands on the picture it is heading for', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClusters(page);
    await chooseBook(page, 'Isaiah');
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeVisible();
    const still = await pictureDigest(page);
    await page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' }).click();
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeHidden();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await watchGlides(page);
    await chooseBook(page, 'Psalms');
    await expect.poll(async () => (await glideChanges(page)).length).toBeGreaterThan(0);
    // Straight on to another book, while the dots may still be on their way to the first.
    await chooseBook(page, 'Isaiah');
    await waitForLanding(page);
    await expect.poll(async () => pictureDigest(page)).toBe(still);
  });

  test('the tour still plays, closing an open book with a glide', async ({ page }) => {
    await openClusters(page);
    await watchGlides(page);
    await chooseBook(page, 'Psalms');
    await waitForLanding(page);

    await watchGlides(page);
    const tour = page.locator(ACTIVE).getByRole('button', { name: /tour/ });
    await (await viewControl(page, tour)).click();
    // Its first stops (a slow machine, laying the whole Bible out again, may be past the first).
    await expect(page).toHaveURL(/ref=(Gen\.1\.1|Gen\.3\.15|Ps\.23\.1)\b/);
    // The book is closed: the way back to the whole Bible has nowhere left to go.
    await expect(page.locator(ACTIVE).getByRole('button', { name: 'Whole Bible' })).toBeHidden();
    expect((await waitForLanding(page)).some((change) => change.gliding)).toBe(true);
  });
});
