import { expect, test } from '@playwright/test';
import { ACTIVE, PANEL, openPassage, waitForApp } from './helpers.ts';

test.describe('cross-references', () => {
  test('a verse lists where it points and what points at it', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    await expect(page.locator(PANEL).getByRole('button', { name: /References/ })).toBeVisible();
    await expect(page.locator(PANEL).getByRole('button', { name: /Referenced by/ })).toBeVisible();
    await expect(
      page
        .locator(PANEL)
        .getByRole('button', { name: /^Romans 5:8/ })
        .first(),
    ).toBeVisible();
  });

  test('a section can be folded away, and stays folded on the next visit', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    const band = page.locator(PANEL).getByRole('button', { name: /^References where/ });
    await band.click();
    await expect(band).toHaveAttribute('aria-expanded', 'false');

    await page.reload();
    await waitForApp(page);
    await expect(
      page.locator(PANEL).getByRole('button', { name: /^References where/ }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  test('the section heading stays on screen while its list scrolls past it', async ({ page }) => {
    await openPassage(page, 'Gen.1.1');
    const scroll = page.locator(`${PANEL} [class*="scroll"]`);
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight * 0.4;
    });
    const stuck = await scroll.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      return [...element.querySelectorAll('h3')]
        .filter((heading) => Math.abs(heading.getBoundingClientRect().top - top) < 4)
        .map((heading) => heading.textContent.trim().slice(0, 20));
    });
    expect(stuck.length).toBe(1);
  });

  test('the summary jumps to a folded section, even the last, and puts it at the top', async ({
    page,
  }) => {
    await openPassage(page, 'John.3.16');
    const panel = page.locator(PANEL);
    const notes = panel.getByRole('button', { name: /^NET notes/ });
    const words = panel.getByRole('button', { name: /^Same Greek word/ });
    await expect(notes).toBeVisible();
    await expect(words).toBeVisible();
    // Everything from the notes down folded: the panel is then as short as it gets, and a scroll
    // measured before the notes open would stop short of them.
    for (const band of [notes, words, panel.getByRole('button', { name: /^Study elsewhere/ })]) {
      if ((await band.getAttribute('aria-expanded')) === 'true') {
        await band.click();
      }
    }
    await panel.locator('[class*="summaryLink"]', { hasText: /notes?$/ }).click();
    await expect(notes).toHaveAttribute('aria-expanded', 'true');
    await expect(notes).toBeFocused();
    const offset = await page.locator(`${PANEL} [class*="scroll"]`).evaluate((scroll) => {
      const section = scroll.querySelector('section[data-section="net-notes"]');
      return (
        (section?.getBoundingClientRect().top ?? Infinity) - scroll.getBoundingClientRect().top
      );
    });
    expect(Math.abs(offset)).toBeLessThanOrEqual(2);
  });

  test('the genre breakdown opens', async ({ page }) => {
    await openPassage(page, 'John.3.16');
    const band = page.locator(PANEL).getByRole('button', { name: /Links by genre/ });
    await band.click();
    await expect(band).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(PANEL).getByText('Gospels').first()).toBeVisible();
  });

  test('raising the vote threshold shows fewer links, and says so in the address', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForApp(page);
    const shownBefore = await page
      .locator(ACTIVE)
      .getByText(/of 344,799 links shown/)
      .textContent();
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Filters/ })
      .click();
    await page.locator(ACTIVE).getByRole('combobox').first().selectOption('20');
    await expect(page).toHaveURL(/votes=20/);
    await expect(page.locator(ACTIVE).getByText(/of 344,799 links shown/)).not.toHaveText(
      shownBefore ?? '',
    );
  });

  test('a filtered link is shared by its address', async ({ page }) => {
    await page.goto('./?votes=20');
    await waitForApp(page);
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Filters/ })
      .click();
    await expect(page.locator(ACTIVE).getByRole('combobox').first()).toHaveValue('20');
  });

  test('a genre can be hidden and shown again', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    // On a phone the legend is folded into an icon button; the genres are behind it.
    const legend = page.locator(ACTIVE).getByRole('button', { name: 'Show genres' });
    if (await legend.isVisible()) {
      await legend.click();
    }
    const law = page.locator(ACTIVE).getByRole('button', { name: /^Law/ }).first();
    await law.click();
    await expect(law).toHaveAttribute('aria-pressed', 'false');
    await law.click();
    await expect(law).toHaveAttribute('aria-pressed', 'true');
  });
});
