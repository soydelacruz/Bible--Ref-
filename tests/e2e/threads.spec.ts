import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp } from './helpers.ts';

/** The chapter's sticky bar, which condenses once the chapter's heading has scrolled away. */
const BAR = `${ACTIVE} [data-condensed]`;

async function openThreads(page: Page, ref: string, query = ''): Promise<void> {
  await page.goto(`./threads/?ref=${ref}${query}`);
  await waitForApp(page);
  await page.locator(BAR).waitFor();
}

/**
 * Whether the selected verse is wholly on screen: below the chapter bar, which hides what scrolls
 * under it, and above the bottom of the reading pane.
 */
async function selectedVerseInView(page: Page): Promise<boolean> {
  return page.locator(BAR).evaluate((bar) => {
    const pane = bar.parentElement;
    const verse = pane?.querySelector('li[data-selected="true"]');
    if (!pane || !verse) return false;
    const rect = verse.getBoundingClientRect();
    return (
      rect.top >= bar.getBoundingClientRect().bottom - 1 &&
      rect.bottom <= pane.getBoundingClientRect().bottom + 1
    );
  });
}

test.describe('reading in Threads', () => {
  test('the chapter bar settles wherever the reading stops', async ({ page }) => {
    await openThreads(page, 'John.1');
    // Condensing the bar used to shorten the page, the browser's scroll anchoring then pulled the
    // reading back above the point where it condenses, and the bar flipped every frame, redrawing
    // the threads each time. At every stop on the way down and back up, it must hold still.
    const unsettled = await page.locator(BAR).evaluate(async (bar) => {
      const pane = bar.parentElement;
      if (!pane) return ['no reading pane'];
      const frames = async (count: number) =>
        new Promise<void>((resolve) => {
          const step = (left: number) => {
            if (left === 0) resolve();
            else
              requestAnimationFrame(() => {
                step(left - 1);
              });
          };
          step(count);
        });
      let flips = 0;
      new MutationObserver((records) => {
        flips += records.length;
      }).observe(bar, { attributeFilter: ['data-condensed'] });
      const stops = Array.from({ length: 31 }, (_, index) => index * 8);
      const found: string[] = [];
      for (const top of [...stops, ...stops.toReversed()]) {
        pane.scrollTop = top;
        await frames(4);
        const before = flips;
        await frames(12);
        if (flips !== before) found.push(`${String(top)}px: ${String(flips - before)} flips`);
      }
      return found;
    });
    expect(unsettled).toEqual([]);

    // And it still does its job: slim once the heading is gone, full again at the top.
    const pane = page.locator(BAR).locator('..');
    await pane.evaluate((element) => {
      element.scrollTop = 600;
    });
    await expect(page.locator(BAR)).toHaveAttribute('data-condensed', 'true');
    await pane.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(page.locator(BAR)).toHaveAttribute('data-condensed', 'false');
  });

  test('a verse chosen while it sits under the chapter bar is brought out from under it', async ({
    page,
  }) => {
    await openThreads(page, 'Ps.119.100');
    await expect.poll(async () => selectedVerseInView(page)).toBe(true);
    // Scroll the verse before it under the bar, partly hidden but still inside the pane.
    await page.locator(BAR).evaluate((bar) => {
      const pane = bar.parentElement;
      const previous = pane?.querySelector('ol > li:nth-child(99)');
      if (!pane || !previous) return;
      pane.scrollTop +=
        previous.getBoundingClientRect().top - (bar.getBoundingClientRect().bottom - 20);
    });
    await page.locator(PANEL).getByRole('button', { name: 'Previous verse' }).click();
    await expect(page).toHaveURL(/ref=Ps\.119\.99/);
    await expect.poll(async () => selectedVerseInView(page)).toBe(true);
  });

  test('the selected verse stays in view when the reading pane gets shorter', async ({ page }) => {
    await openThreads(page, 'Ps.119.100');
    await expect.poll(async () => selectedVerseInView(page)).toBe(true);
    // Rest the verse at the bottom of the pane, so a shorter pane would cut it off.
    await page.locator(BAR).evaluate((bar) => {
      const pane = bar.parentElement;
      const verse = pane?.querySelector('li[data-selected="true"]');
      if (!pane || !verse) return;
      pane.scrollTop -=
        pane.getBoundingClientRect().bottom - 8 - verse.getBoundingClientRect().bottom;
    });
    expect(await selectedVerseInView(page)).toBe(true);
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    await page.setViewportSize({ width: size.width, height: size.height - 200 });
    await expect.poll(async () => selectedVerseInView(page)).toBe(true);
  });

  test('says what the threads and the numbers are', async ({ page, isMobile }) => {
    await openThreads(page, 'John.1');
    // Written twice, a finger's way and a mouse's, and only the one this screen uses is shown.
    const hint = page
      .locator(ACTIVE)
      .getByText(/^Threads run from each verse/)
      .filter({ visible: true });
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText(isMobile ? 'tap a verse' : 'click a verse');
    // The number beside a verse is a count a screen reader can say: "4 links", not "4".
    const first = page.locator(`${ACTIVE} ol > li`).first();
    await expect(first).toContainText(/\d+ links?$/);
    await expect(first.getByRole('button', { name: /^Verse 1:/ })).toHaveAccessibleName(
      'Verse 1: show its cross-references',
    );
  });

  test('the verses are marked as the translation’s language, not the interface’s', async ({
    page,
  }) => {
    await openThreads(page, 'John.1', '&t=kjv&lang=pt');
    await expect(page.locator('html')).toHaveAttribute('lang', /^pt/);
    await expect(page.locator(`${ACTIVE} ol > li [lang="en"]`).first()).toContainText(
      /In the beginning was the Word/,
    );
  });
});
