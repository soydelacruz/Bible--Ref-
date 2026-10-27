import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, headerButton, waitForApp } from './helpers.ts';

/**
 * Wander, in every view's header: a press goes to a verse with many links, through the address
 * like any other passage, and says where it went. Which verse is chance, so these ask only that
 * it is a verse, a new one each time, and that the view shows it.
 */

/** The verse in the address, e.g. `Mic.6.8`; `null` for none, or for a chapter. */
function verseInAddress(page: Page): string | null {
  const ref = new URL(page.url()).searchParams.get('ref');
  return ref !== null && /^\w+\.\d+\.\d+$/.test(ref) ? ref : null;
}

/** Presses Wander, wherever the header keeps it, and waits until the address names a new verse. */
async function wander(page: Page): Promise<string> {
  const before = verseInAddress(page);
  await (await headerButton(page, /^Wander$/)).click();
  await expect.poll(() => verseInAddress(page)).not.toBe(before);
  const verse = verseInAddress(page);
  if (verse === null) throw new Error('Wander went to no verse');
  return verse;
}

/** What the page's live regions have said since `listen`, oldest first. */
interface Heard {
  heard?: string[];
}

/**
 * Keeps everything the live regions say from now on. A region speaks for a few seconds only, and
 * a slow machine can take that long to look, so it is written down as it changes.
 */
async function listen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const heard: string[] = [];
    (window as Heard).heard = heard;
    new MutationObserver(() => {
      for (const region of document.querySelectorAll('[role="status"]')) {
        const text = region.textContent;
        if (text !== '' && heard.at(-1) !== text) heard.push(text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

/** Where Wander last said it went, e.g. "Micah 6:8". */
async function announced(page: Page, language = /^Wandered to /): Promise<string> {
  const last = () =>
    page.evaluate(
      (source) => (window as Heard).heard?.findLast((text) => new RegExp(source).test(text)),
      language.source,
    );
  await expect.poll(last).toBeTruthy();
  return (await last())?.replace(language, '') ?? '';
}

const VIEWS = [
  { name: 'Arcs', path: './' },
  { name: 'Threads', path: './threads/' },
  { name: 'Clusters', path: './clusters/' },
] as const;

test.describe('Wander', () => {
  for (const view of VIEWS) {
    test(`goes from ${view.name} to a new verse each time, and Back retraces it`, async ({
      page,
    }) => {
      await page.goto(`${view.path}?ref=John.3.16`);
      await waitForApp(page);
      await listen(page);
      const path = new URL(page.url()).pathname;

      const first = await wander(page);
      expect(first).not.toBe('John.3.16');
      // The view stays the one it was, and opens the verse as it would any other.
      expect(new URL(page.url()).pathname).toBe(path);
      const name = await announced(page);
      await expect(page.locator(PANEL).getByRole('heading', { name })).toBeVisible();
      if (view.name === 'Threads') {
        // The chapter, opened at the verse.
        await expect(page.locator(`${ACTIVE} li[data-selected="true"]`)).toBeVisible();
      }

      const second = await wander(page);
      expect(second).not.toBe(first);

      await page.goBack();
      await expect.poll(() => verseInAddress(page)).toBe(first);
      await page.goBack();
      await expect.poll(() => verseInAddress(page)).toBe('John.3.16');
    });
  }

  test('wanders from the keyboard, and stays there for the next press', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'On a phone Wander is a row of the More menu, which closes as it goes.');
    await page.goto('./threads/');
    await waitForApp(page);
    const button = page.locator(ACTIVE).getByRole('button', { name: 'Wander' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => verseInAddress(page)).not.toBeNull();
    const first = verseInAddress(page);
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => verseInAddress(page)).not.toBe(first);
  });

  test('gives a little under a press, and only dims where motion is reduced', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'On a phone Wander is a row of the More menu, which closes as it goes.');
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      await page.goto('./threads/');
      await waitForApp(page);
      const button = page.locator(ACTIVE).getByRole('button', { name: 'Wander' });
      const box = await button.boundingBox();
      if (!box) throw new Error('Wander is not on screen');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const pressed = () =>
        button.evaluate((element) => {
          const { transform, opacity } = getComputedStyle(element);
          return { transform, opacity };
        });
      await expect
        .poll(pressed)
        .toEqual(
          reducedMotion === 'reduce'
            ? { transform: 'none', opacity: '0.7' }
            : { transform: 'matrix(0.97, 0, 0, 0.97, 0, 0)', opacity: '1' },
        );
      await page.mouse.up();
    }
  });

  test('speaks the reader’s language', async ({ page }) => {
    await page.goto('./clusters/?lang=pt');
    await waitForApp(page);
    await listen(page);
    await (await headerButton(page, /^Surpreenda-me$/)).click();
    expect(await announced(page, /^Surpresa: /)).toMatch(/\d+:\d+$/);
  });
});
