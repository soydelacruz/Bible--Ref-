import { expect, test, type Locator, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp } from './helpers.ts';

/**
 * What makes the app feel like one on a phone rather than a web page on one: controls a finger can
 * find, a details sheet that peeks rather than covers, and motion that answers a finger but not a
 * key. The phone project's device (a Pixel 7: touch, a coarse pointer) is the point of all of it,
 * so the desktop project does not run these.
 */
test.skip(({ isMobile }) => !isMobile, 'A phone’s touch screen, and the sheet it gets.');

/** What a fingertip needs: 44 by 44 CSS pixels, the size iOS and Android both ask for. */
const FINGERTIP = 44;

/** A control too small for a finger: what it is, and its target's size. */
interface SmallTarget {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The controls inside `scope` whose target is smaller than a fingertip.
 *
 * A target is the control's box and any hit area drawn round it by an absolutely placed `::before`
 * or `::after` (a swatch's ring, a small word's reach above and below), since that is what a tap
 * lands on. A link or a button set inline in a sentence is left out, as WCAG's 2.5.8 leaves it out:
 * its height is the line's, and the words around it are not a target to make room for. So is a
 * radio inside a label: the whole label is its target, and is counted instead.
 */
async function smallTargets(scope: Locator): Promise<SmallTarget[]> {
  return scope.evaluateAll((roots, fingertip) => {
    const controls = roots.flatMap((root) => [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [role="slider"], label:has(input)',
      ),
    ]);
    const hitBox = (control: HTMLElement) => {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      let { left, top, right, bottom } = box;
      if (style.position !== 'static') {
        // A pseudo-element placed absolutely is placed in the control's padding box.
        const inner = {
          left: box.left + parseFloat(style.borderLeftWidth),
          top: box.top + parseFloat(style.borderTopWidth),
          right: box.right - parseFloat(style.borderRightWidth),
          bottom: box.bottom - parseFloat(style.borderBottomWidth),
        };
        for (const pseudo of ['::before', '::after']) {
          const area = getComputedStyle(control, pseudo);
          const insets = [area.left, area.top, area.right, area.bottom].map(parseFloat);
          const [l = NaN, t = NaN, r = NaN, b = NaN] = insets;
          if (
            area.content === 'none' ||
            area.position !== 'absolute' ||
            insets.some(Number.isNaN)
          ) {
            continue;
          }
          left = Math.min(left, inner.left + l);
          top = Math.min(top, inner.top + t);
          right = Math.max(right, inner.right - r);
          bottom = Math.max(bottom, inner.bottom - b);
        }
      }
      return { width: right - left, height: bottom - top };
    };
    const inSentence = (control: HTMLElement) => {
      // A button set inline is laid out as an inline block, a box in the line all the same.
      if (!['inline', 'inline-block'].includes(getComputedStyle(control).display)) {
        return false;
      }
      // The block of text it is set in, past any inline wrapper (a note's italics, say).
      let block = control.parentElement;
      while (block && getComputedStyle(block).display === 'inline') {
        block = block.parentElement;
      }
      return (block?.textContent.trim() ?? '') !== control.textContent.trim();
    };
    return controls
      .filter((control) => {
        const { width, height } = control.getBoundingClientRect();
        const shown =
          width > 0 &&
          height > 0 &&
          getComputedStyle(control).visibility !== 'hidden' &&
          control.closest('[inert], [aria-hidden="true"]') === null;
        const labelled =
          control instanceof HTMLInputElement &&
          ['radio', 'checkbox'].includes(control.type) &&
          control.closest('label') !== null;
        return shown && !labelled && !inSentence(control);
      })
      .map((control) => ({
        name: (control.getAttribute('aria-label') ?? control.textContent).trim().slice(0, 40),
        ...hitBox(control),
      }))
      .filter((target) => target.width < fingertip - 0.5 || target.height < fingertip - 0.5);
  }, FINGERTIP);
}

/** The page's own header: the panel has a header of its own, later in the page. */
function pageHeader(page: Page): Locator {
  return page.locator(ACTIVE).locator('header').first();
}

/** The details sheet's handle, whichever way it is about to move the sheet. */
function sheetHandle(page: Page): Locator {
  return page.locator(PANEL).getByRole('button', { name: /^(Expand|Collapse) details$/ });
}

/**
 * Waits for whatever is moving inside `scope` to have arrived: a menu grows in from a little
 * smaller than it is, and measured on its way it would be a few pixels short. Each look waits two
 * frames first, so that a change made in this one (the sheet's peek, measured as its header
 * arrives) has begun its transition by the time it is looked for. The details can come a moment
 * after the page says it is ready, sliding up as they do, so they are waited for too.
 */
async function settled(scope: Locator): Promise<void> {
  // There at all first: nothing to look at would count as nothing moving.
  await scope.first().waitFor({ state: 'attached' });
  await expect
    .poll(() =>
      scope.evaluateAll(async (roots) => {
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        return roots.flatMap((root) => root.getAnimations({ subtree: true })).length;
      }),
    )
    .toBe(0);
}

/**
 * Starts writing down the transitions that begin on the details panel and on menus, as
 * "panel:transform", "menu:opacity" and so on. A transition is noted when it is created rather
 * than looked for while it runs, so a slow machine cannot miss one that is quick.
 */
async function noteTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset['transitions'] = '';
    document.addEventListener(
      'transitionrun',
      (event) => {
        const { target } = event;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const what =
          target.localName === 'aside'
            ? 'panel'
            : target.hasAttribute('data-popover')
              ? 'menu'
              : '';
        if (what !== '') {
          root.dataset['transitions'] =
            `${root.dataset['transitions'] ?? ''} ${what}:${event.propertyName}`;
        }
      },
      true,
    );
  });
}

/** The transitions noted since `noteTransitions` (or the last call to this), and clears them. */
async function takeTransitions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const noted = (root.dataset['transitions'] ?? '').split(' ').filter(Boolean);
    root.dataset['transitions'] = '';
    return [...new Set(noted)].sort();
  });
}

test.describe('every control is a fingertip’s size', () => {
  test('in the header and the details of a verse, collapsed and opened up', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await settled(page.locator(PANEL));
    expect(await smallTargets(pageHeader(page))).toEqual([]);
    expect(await smallTargets(page.locator(PANEL))).toEqual([]);
    await sheetHandle(page).click();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await settled(page.locator(PANEL));
    // Every section open, so their rows, words and links are on the page to measure.
    const folded = page.locator(PANEL).locator('h3 button[aria-expanded="false"]');
    for (let left = await folded.count(); left > 0; left -= 1) {
      await folded.first().click();
      await expect(folded).toHaveCount(left - 1);
    }
    expect(await smallTargets(page.locator(PANEL))).toEqual([]);
  });

  test('in the details of a chapter, verse by verse', async ({ page }) => {
    await page.goto('./?ref=Ps.23');
    await waitForApp(page);
    await sheetHandle(page).click();
    expect(await smallTargets(page.locator(PANEL))).toEqual([]);
  });

  test('in every menu, and in the menus inside More', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    const header = pageHeader(page);
    const popovers = page.locator(`${ACTIVE} [data-popover]:not([data-leaving])`);

    await header.getByRole('button', { name: /^Filters/ }).click();
    await expect(popovers).toHaveCount(1);
    await settled(popovers);
    expect(await smallTargets(popovers)).toEqual([]);
    await page.keyboard.press('Escape');

    await header.getByRole('button', { name: /^More/ }).click();
    const rows = page.locator(`${ACTIVE} [data-popover] button[aria-expanded]`);
    await expect(rows.first()).toBeVisible();
    await settled(popovers);
    expect(await smallTargets(popovers)).toEqual([]);
    // Each menu among the rows unfolds in place; what it holds is measured with it open.
    const names = await rows.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') ?? ''),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const row = popovers.getByRole('button', { name, exact: true });
      await row.click();
      await expect(row).toHaveAttribute('aria-expanded', 'true');
      await settled(popovers);
      expect(await smallTargets(popovers), name).toEqual([]);
      await row.click();
      await expect(row).toHaveAttribute('aria-expanded', 'false');
    }
  });
});

test.describe('the details sheet', () => {
  /** The part of the sheet that shows, collapsed, and where its content sits within it. */
  async function peek(page: Page) {
    return page.locator(ACTIVE).evaluate((view) => {
      const sheet = view.querySelector('aside');
      const footer = view.querySelector('footer');
      const header = sheet?.querySelector('header');
      const below = header?.nextElementSibling;
      const bottom = footer?.getBoundingClientRect().top ?? innerHeight;
      const top = sheet?.getBoundingClientRect().top ?? bottom;
      return {
        shown: bottom - top,
        screen: innerHeight,
        title: sheet?.querySelector('h2')?.getBoundingClientRect().bottom ?? Infinity,
        summary: header?.querySelector(':scope > p')?.getBoundingClientRect().bottom ?? Infinity,
        content: below?.getBoundingClientRect().top ?? -Infinity,
        bottom,
      };
    });
  }

  for (const [name, query] of [
    ['a verse', '?ref=John.3.16'],
    // A header a line taller: in Portuguese the genre beside the buttons takes two lines.
    ['a taller header, in a longer language', '?ref=1Thess.5.16&lang=pt'],
  ] as const) {
    test(`peeks with ${name}: its name and the line counting its links, and no more`, async ({
      page,
    }) => {
      await page.goto(`./${query}`);
      await waitForApp(page);
      // Settled where it peeks: it slides up from the screen's edge as it opens.
      await settled(page.locator(PANEL));
      const measured = await peek(page);
      // Not a sliver: the whole name and the whole line under it are above the sheet's fold.
      expect(measured.title).toBeLessThanOrEqual(measured.bottom);
      expect(measured.summary).toBeLessThanOrEqual(measured.bottom);
      // Not half the screen: what follows the header waits for the sheet to be opened.
      expect(measured.content).toBeGreaterThanOrEqual(measured.bottom - 1);
      expect(measured.shown).toBeLessThan(0.3 * measured.screen);
    });
  }

  test('opens up when a count in its header jumps to a section below the fold', async ({
    page,
  }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await settled(page.locator(PANEL));
    await page
      .locator(PANEL)
      .getByRole('button', { name: /^\d+ references$/ })
      .tap();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await settled(page.locator(PANEL));
    const band = page.locator(PANEL).getByRole('button', { name: /^References/ });
    await expect(band).toBeFocused();
    await expect(band).toBeInViewport({ ratio: 1 });
  });

  test('never covers the footer, collapsed or opened up', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    const footerIsOnTop = () =>
      page.locator(`${ACTIVE} footer`).evaluate((footer) => {
        const { left, right, top, bottom } = footer.getBoundingClientRect();
        return [0.1, 0.5, 0.9].every((share) => {
          const hit = document.elementFromPoint(left + (right - left) * share, (top + bottom) / 2);
          return hit !== null && footer.contains(hit);
        });
      });
    expect(await footerIsOnTop()).toBe(true);
    await sheetHandle(page).click();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await footerIsOnTop()).toBe(true);
  });

  test('slides away when closed, on the curve it came in on, and is gone once it has', async ({
    page,
  }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    // At rest first: the sheet moves to its measured peek as its header arrives.
    await settled(page.locator(PANEL));
    await noteTransitions(page);
    await page.locator(PANEL).getByRole('button', { name: 'Close', exact: true }).click();
    // On its way out it is no longer the panel: nothing in it can be used.
    await expect(page.locator(PANEL)).toHaveAttribute('inert');
    await expect(page.locator(PANEL)).toHaveCount(0);
    expect(await takeTransitions(page)).toContain('panel:transform');
  });

  test('fades away instead, with less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    // At rest first: the sheet moves to its measured peek as its header arrives.
    await settled(page.locator(PANEL));
    await noteTransitions(page);
    await page.locator(PANEL).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator(PANEL)).toHaveCount(0);
    expect(await takeTransitions(page)).toEqual(['panel:opacity']);
  });

  test('is gone at once when closed from the keyboard', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    // At rest first: the sheet moves to its measured peek as its header arrives.
    await settled(page.locator(PANEL));
    await noteTransitions(page);
    await page.locator(PANEL).getByRole('button', { name: 'Close', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(PANEL)).toHaveCount(0);
    expect(await takeTransitions(page)).toEqual([]);
  });
});

test.describe('a menu', () => {
  test('grows out of its button when a finger opens it, and fades as it closes', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForApp(page);
    await noteTransitions(page);
    const button = pageHeader(page).getByRole('button', { name: /^Filters/ });
    await button.click();
    const popover = page.locator(`${ACTIVE} [data-popover]`);
    await expect(popover).toBeVisible();
    expect(await takeTransitions(page)).toEqual(['menu:opacity', 'menu:transform']);
    // It grows from the button: the origin of its scale is the button's middle.
    const origin = await popover.evaluate((element) => {
      const [x = NaN, y = NaN] = getComputedStyle(element)
        .transformOrigin.split(' ')
        .map(parseFloat);
      const box = element.getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    });
    const trigger = await button.boundingBox();
    expect(Math.abs(origin.x - ((trigger?.x ?? 0) + (trigger?.width ?? 0) / 2))).toBeLessThan(4);
    expect(Math.abs(origin.y - ((trigger?.y ?? 0) + (trigger?.height ?? 0) / 2))).toBeLessThan(4);

    // A tap somewhere with nothing to do, outside it.
    await pageHeader(page).tap({ position: { x: 200, y: 2 } });
    await expect(popover).toHaveCount(0);
    expect(await takeTransitions(page)).toContain('menu:opacity');
  });

  test('fades in where it stands with less motion, and does not grow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await waitForApp(page);
    await noteTransitions(page);
    await pageHeader(page)
      .getByRole('button', { name: /^Filters/ })
      .click();
    await expect(page.locator(`${ACTIVE} [data-popover]`)).toBeVisible();
    expect(await takeTransitions(page)).toEqual(['menu:opacity']);
  });

  test('is simply there when the keyboard opens it, and simply gone when it closes it', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForApp(page);
    await noteTransitions(page);
    const button = pageHeader(page).getByRole('button', { name: /^Filters/ });
    await button.focus();
    await page.keyboard.press('Enter');
    const popover = page.locator(`${ACTIVE} [data-popover]`);
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    expect(await takeTransitions(page)).toEqual([]);
  });
});

test.describe('turned sideways on a phone with a notch', () => {
  /**
   * Chromium can be told the screen has insets, as a notched phone's does when it is turned:
   * nothing that can be read or used may sit in them. The picture stays out of them too (what is
   * drawn there would be hidden, and an edge is where a gesture starts); only backgrounds and
   * the panel's surface run on to the screen's edge.
   */
  const NOTCH = 47;

  for (const [layout, width] of [
    ['the side panel', 863],
    ['the sheet', 740],
  ] as const) {
    test(`keeps the header, ${layout}, the picture and the footer clear of it`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 360 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { left: NOTCH, right: NOTCH, top: 0, bottom: 21 },
      });
      await page.goto('./?ref=John.3.16');
      await waitForApp(page);
      const outside = await page.locator(ACTIVE).evaluate(
        (view, { notch, screen }) => {
          const pieces = [
            ...view.querySelectorAll(
              'header a, header button, header input, aside h2, aside button, aside p, main canvas, footer a, footer button',
            ),
          ].filter((element) => element.getBoundingClientRect().width > 0);
          return pieces
            .filter((element) => {
              const { left, right } = element.getBoundingClientRect();
              return left < notch - 0.5 || right > screen - notch + 0.5;
            })
            .map((element) => `${element.localName}: ${element.textContent.trim().slice(0, 30)}`);
        },
        { notch: NOTCH, screen: width },
      );
      expect(outside).toEqual([]);
      // The footer stays clear of the home indicator below.
      const footerPadding = await page
        .locator(`${ACTIVE} footer`)
        .evaluate((footer) => parseFloat(getComputedStyle(footer).paddingBottom));
      expect(footerPadding).toBeGreaterThanOrEqual(21);
      await context.close();
    });
  }
});
