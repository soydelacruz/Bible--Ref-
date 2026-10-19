import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, collectErrors, openPanel, waitForApp } from './helpers.ts';

/** Every width the layout has to survive, from the oldest phone to a wide desktop. */
const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 834, 1024, 1280, 1440, 1920];

test.describe('the layout holds at every width', () => {
  test.beforeEach(() => {
    // The phone project does not run this file at all (see playwright.config.ts): these tests
    // set the viewport themselves, so a second project would only repeat them.
    test.skip(test.info().project.name !== 'desktop', 'Widths are driven directly here.');
  });

  for (const width of WIDTHS) {
    test(`${String(width)}px: the footer is one line and nothing runs off the edge`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./');
      await waitForApp(page);

      const measured = await page.locator(`${ACTIVE} footer`).evaluate((footer) => {
        const rect = footer.getBoundingClientRect();
        const [owner, credits] = [...footer.children].map((child) => child.getBoundingClientRect());
        return {
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          ownerTop: Math.round(owner?.top ?? 0),
          creditsTop: Math.round(credits?.top ?? owner?.top ?? 0),
          creditsRight: Math.round(credits?.right ?? owner?.right ?? 0),
        };
      });

      // One line, two ways: the two halves share a top, and the whole thing is one row tall.
      expect(Math.abs(measured.creditsTop - measured.ownerTop)).toBeLessThan(4);
      expect(measured.height).toBeLessThan(34);
      // Nothing runs past the right edge — and the credit in particular, which is a licence
      // condition, has to be readable rather than clipped.
      expect(measured.right).toBeLessThanOrEqual(width);
      expect(measured.creditsRight).toBeLessThanOrEqual(width);
    });
  }

  /**
   * The same widths in every other language the app speaks.
   *
   * English is held to one line, above: it is the language the layout is designed around and the
   * one most readers see. A translation cannot be held to that — Portuguese runs about a fifth
   * longer, and the clause that pushes it over is the CC BY credit, which is a licence condition
   * and not something to drop on a narrow screen. So the promise here is weaker and still worth
   * keeping: never more than two lines, and never off the edge.
   */
  for (const width of WIDTHS) {
    test(`${String(width)}px: a longer language wraps rather than overflowing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./?lang=pt');
      await waitForApp(page);

      const measured = await page.locator(`${ACTIVE} footer`).evaluate((footer) => {
        const rect = footer.getBoundingClientRect();
        const children = [...footer.children].map((child) => child.getBoundingClientRect());
        return {
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          rows: new Set(children.map((child) => Math.round(child.top))).size,
          widest: Math.round(Math.max(...children.map((child) => child.right))),
        };
      });

      expect(measured.rows).toBeLessThanOrEqual(2);
      // Two lines of the same 24px row, with a little room for the gap between them.
      expect(measured.height).toBeLessThan(64);
      expect(measured.right).toBeLessThanOrEqual(width);
      expect(measured.widest).toBeLessThanOrEqual(width);
    });
  }

  /**
   * The details panel, in every language, at every width.
   *
   * The band at the top of each section bleeds past the panel's padding on purpose, so it is
   * wider than its own parent. That is fine until a grid item refuses to shrink below it: then
   * the track grows, and the whole panel scrolls sideways with the counts pushed off the right
   * edge. A longer language is what makes it visible, which is why this runs in both.
   */
  /**
   * Every language the app offers, read from the picker rather than listed here.
   *
   * Listing them means the next language is only covered when somebody remembers to add a line,
   * and the whole point of this test is the language nobody thought about. Asking the app which
   * languages it has covers one the day it ships.
   */
  async function languagesTheAppOffers(page: Page): Promise<readonly string[]> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await waitForApp(page);
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Translation/ })
      .click();
    const picker = page.locator(ACTIVE).getByRole('combobox');
    if ((await picker.count()) === 0) {
      return ['en'];
    }
    return picker
      .first()
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  }

  for (const width of WIDTHS) {
    test(`${String(width)}px: the panel does not scroll sideways, in any language`, async ({
      page,
    }) => {
      const languages = await languagesTheAppOffers(page);
      expect(languages.length).toBeGreaterThan(0);
      // A page load for every language, and each takes a good part of the usual minute with a
      // software renderer: the budget grows with the languages rather than running out at two.
      test.setTimeout(60_000 * (languages.length + 1));

      for (const language of languages) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`./?lang=${language}&ref=2Cor.11`);
        await waitForApp(page);
        await openPanel(page);

        const measured = await page.locator(`${ACTIVE} aside`).evaluate((aside) => {
          const scroller = aside.querySelector('[class*="scroll"]') ?? aside;
          const bands = [...aside.querySelectorAll('h3 button')];
          const right = scroller.getBoundingClientRect().right;
          return {
            overflow: scroller.scrollWidth - scroller.clientWidth,
            // Every count has to stay on screen: it is the one thing a returning reader is
            // looking for, and it sits at the end of the row.
            countsOffscreen: bands.filter((band) => {
              const count = band.querySelector('[class*="count"]');
              return count !== null && count.getBoundingClientRect().right > right + 1;
            }).length,
          };
        });

        expect(measured.overflow, `${language} at ${String(width)}px scrolls sideways`).toBe(0);
        expect(
          measured.countsOffscreen,
          `${language} at ${String(width)}px pushes a count off the edge`,
        ).toBe(0);
      }
    });
  }

  /**
   * The line is set in whatever UI font the reader's system has, and the narrowest and widest of
   * those differ by roughly a tenth: a layout that fits exactly on the machine that drew it can
   * wrap on somebody's phone, which is how a two-line footer at 320px once reached CI.
   *
   * A tenth is the whole budget, not a safety factor on top of one. Asking for more would mean
   * something different on every machine — on a narrow-font system it reads as "survive a wide
   * font", but on a system that already has the widest font it reads as "survive a font that
   * does not exist", which is a test no honest layout can pass.
   */
  for (const width of [320, 360, 375]) {
    test(`${String(width)}px: the footer still holds with a tenth wider font`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./');
      await waitForApp(page);
      const rows = await page.locator(`${ACTIVE} footer`).evaluate((footer) => {
        const element = footer as HTMLElement;
        const base = Number.parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${String(base * 1.1)}px`;
        const tops = [...footer.children].map((child) =>
          Math.round(child.getBoundingClientRect().top),
        );
        element.style.fontSize = '';
        return new Set(tops).size;
      });
      expect(rows).toBe(1);
    });
  }

  test('the details panel is a side column on a desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    const box = await page.locator(PANEL).boundingBox();
    expect(box?.x).toBeGreaterThan(700);
    expect(box?.height).toBeGreaterThan(500);
  });

  test('the details panel is a sheet at the bottom on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    const box = await page.locator(PANEL).boundingBox();
    expect(Math.round(box?.x ?? -1)).toBe(0);
    expect(Math.round(box?.width ?? 0)).toBe(390);
    // It starts part-way up, leaving the visualization in view above it.
    expect(box?.y).toBeGreaterThan(200);
  });

  test('the sheet opens to full height when its handle is used', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    const before = await page.locator(PANEL).boundingBox();
    await page
      .locator(PANEL)
      .getByRole('button', { name: /Expand details/ })
      .click();
    await expect
      .poll(async () => Math.round((await page.locator(PANEL).boundingBox())?.y ?? 0))
      .toBeLessThan(Math.round(before?.y ?? 0));
  });

  test('the header keeps its controls reachable on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await waitForApp(page);
    for (const control of [/Filters/, /Translation/]) {
      await expect(page.locator(ACTIVE).getByRole('button', { name: control })).toBeVisible();
    }
    await expect(page.locator(ACTIVE).getByRole('searchbox')).toBeVisible();
  });
});

test.describe('every page loads cleanly', () => {
  for (const [name, path, ready] of [
    ['the arcs', './', `${ACTIVE} footer`],
    ['the reading threads', './threads/', `${ACTIVE} footer`],
    ['the debug page', './debug/', 'table'],
  ] as const) {
    test(`${name} renders with no errors in the console`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await page.locator(ready).first().waitFor({ timeout: 45_000 });
      expect(errors).toEqual([]);
    });
  }
});
