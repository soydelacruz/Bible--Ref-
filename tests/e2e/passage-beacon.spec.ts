import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp } from './helpers.ts';

/**
 * The passage beacon: a switch between views with a passage focused carries a small glowing dot,
 * named after the passage, from where the last view draws it to where the next one does. It is
 * over in about half a second, so the page writes down every beacon it shows as it shows it, and
 * the tests read that back.
 */

/** What became of one beacon: its name, each place it was put, and whether it landed. */
interface BeaconTrace {
  readonly name: string;
  readonly places: { readonly x: number; readonly y: number }[];
  landed: boolean;
}

interface Traced {
  beacons?: BeaconTrace[];
  entering?: string[];
}

/** Writes down every beacon from now on, and every view that fades in without one. */
async function trace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const beacons: BeaconTrace[] = [];
    const entering: string[] = [];
    Object.assign(window, { beacons, entering });
    const traces = new WeakMap<Element, BeaconTrace>();
    const placeOf = (element: HTMLElement) => ({
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
    });
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof HTMLElement)) continue;
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.hasAttribute('data-passage-beacon')) {
            const found = { name: node.textContent, places: [placeOf(node)], landed: false };
            traces.set(node, found);
            beacons.push(found);
          }
        }
        const found = traces.get(target);
        if (found && record.attributeName === 'style') found.places.push(placeOf(target));
        if (found && record.attributeName === 'data-landed') found.landed = true;
        if (record.attributeName === 'data-entering' && target.hasAttribute('data-entering')) {
          entering.push(target.dataset['view'] ?? '');
        }
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'data-landed', 'data-entering'],
    });
  });
}

async function traced(page: Page): Promise<Required<Traced>> {
  return page.evaluate(() => {
    const { beacons = [], entering = [] } = window as Traced;
    return { beacons, entering };
  });
}

/**
 * Where the beacon should land in Threads: on the selected verse's number, or, when that is out
 * of sight, at the edge of the reading nearest it — 20px inside, clear of the chapter bar.
 */
async function threadsLanding(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const view = document.querySelector('[data-view="threads"]');
    const number = view?.querySelector('li button[aria-pressed="true"]')?.getBoundingClientRect();
    const reading = view?.querySelector('ol')?.closest('[class*="reading"]');
    const pane = reading?.getBoundingClientRect();
    const bar = reading?.querySelector('nav')?.closest('[data-condensed]')?.getBoundingClientRect();
    if (!number || !pane || !bar) throw new Error('No verse is selected in Threads');
    const clamp = (value: number, low: number, high: number) =>
      Math.min(Math.max(value, low), high);
    return {
      x: clamp(number.right - number.height / 2, pane.left + 20, pane.right - 20),
      y: clamp(number.top + number.height / 2, bar.bottom + 20, pane.bottom - 20),
    };
  });
}

async function switchTo(page: Page, view: 'Arcs' | 'Threads' | 'Clusters'): Promise<void> {
  await page.locator(ACTIVE).getByRole('link', { name: view, exact: true }).click();
}

/** The passage is still the one the reader focused, in the view now shown. */
async function expectFocused(page: Page, path: RegExp, heading: string): Promise<void> {
  await expect(page).toHaveURL(path);
  await expect(page).toHaveURL(/ref=John\.3\.16/);
  await expect(page.locator(PANEL).getByRole('heading', { name: heading })).toBeVisible();
}

test.describe('the passage beacon', () => {
  test('carries the focused passage to where the next view draws it, and back', async ({
    page,
  }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await trace(page);

    await switchTo(page, 'Threads');
    await expectFocused(page, /threads\//, 'John 3:16');
    await expect(page.locator(`${ACTIVE} li button[aria-pressed="true"]`)).toHaveText('16');
    // Focus follows into the view, as it always has.
    await expect(
      page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }),
    ).toBeFocused();

    await expect.poll(async () => (await traced(page)).beacons.at(-1)?.landed).toBe(true);
    const [beacon] = (await traced(page)).beacons;
    expect(beacon?.name).toBe('John 3:16');
    const start = beacon?.places.at(0);
    const end = beacon?.places.at(-1);
    const landing = await threadsLanding(page);
    expect(end?.x).toBeCloseTo(landing.x, 0);
    expect(end?.y).toBeCloseTo(landing.y, 0);
    // It came from the arcs' axis, not from where it landed.
    expect(Math.hypot((start?.x ?? 0) - landing.x, (start?.y ?? 0) - landing.y)).toBeGreaterThan(
      40,
    );
    // Then it goes, and leaves nothing behind to point at or be read.
    await expect(page.locator('[data-passage-beacon]')).toHaveCount(0);

    // Back crosses between the views the same way.
    await page.goBack();
    await expectFocused(page, /\/(\?|$)/, 'John 3:16');
    await expect.poll(async () => (await traced(page)).beacons.length).toBe(2);
    await expect.poll(async () => (await traced(page)).beacons[1]?.landed).toBe(true);
    expect((await traced(page)).beacons[1]?.name).toBe('John 3:16');
  });

  test('travels to the dot in Clusters', async ({ page }) => {
    await page.goto('./threads/?ref=John.3.16');
    await waitForApp(page);
    await trace(page);

    await switchTo(page, 'Clusters');
    await expectFocused(page, /clusters\//, 'John 3:16');
    await expect.poll(async () => (await traced(page)).beacons[0]?.landed).toBe(true);
    const end = (await traced(page)).beacons[0]?.places.at(-1);
    const stage = await page.locator(`${ACTIVE} canvas[role="img"]`).boundingBox();
    expect(stage).not.toBeNull();
    if (end && stage) {
      expect(end.x).toBeGreaterThan(stage.x);
      expect(end.x).toBeLessThan(stage.x + stage.width);
      expect(end.y).toBeGreaterThan(stage.y);
      expect(end.y).toBeLessThan(stage.y + stage.height);
    }
  });

  test('only crossfades from the keyboard: nothing travels', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await trace(page);

    await page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expectFocused(page, /threads\//, 'John 3:16');
    await expect(
      page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }),
    ).toBeFocused();
    expect((await traced(page)).beacons).toEqual([]);
  });

  test('only crossfades for a reader who asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await trace(page);

    await switchTo(page, 'Threads');
    await expectFocused(page, /threads\//, 'John 3:16');
    expect((await traced(page)).beacons).toEqual([]);
  });

  test('has nothing to carry with no passage focused', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await trace(page);

    await switchTo(page, 'Clusters');
    await expect(page).toHaveURL(/clusters\//);
    await expect(page.locator(ACTIVE).locator('canvas').first()).toBeVisible();
    expect((await traced(page)).beacons).toEqual([]);
  });

  test('fades the next view in where the browser cannot animate the page', async ({ page }) => {
    // A browser without the View Transitions API.
    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, 'startViewTransition');
    });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await trace(page);

    await switchTo(page, 'Threads');
    await expectFocused(page, /threads\//, 'John 3:16');
    const { beacons, entering } = await traced(page);
    expect(beacons).toEqual([]);
    expect(entering).toEqual(['threads']);
    // The fade is short, and lets the last view go once it is over.
    await expect(page.locator('[data-leaving], [data-entering]')).toHaveCount(0);
  });
});
