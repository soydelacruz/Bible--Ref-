import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp, openHeaderMenu, headerButton } from './helpers.ts';

/**
 * Back and Forward, which readers press far more often than any button this app draws.
 *
 * Every piece of state here lives in the URL, so each of these is really the same question: does
 * a history entry still mean what it meant when the reader made it? The app keeps the address in
 * step with what it shows, and the risk in that is a sync that runs the wrong way — rewriting the
 * entry the reader just returned to, instead of reading it.
 */

/** The query of the page as the browser currently has it, which is what Back and Forward move. */
function query(page: Page): string {
  return new URL(page.url()).search;
}

/** The language picker lives inside the translation menu, so the menu has to be open first. */
async function chooseLanguage(page: Page, value: string): Promise<void> {
  await openHeaderMenu(page, /Translation|Tradução/);
  await page
    .locator(ACTIVE)
    .getByRole('combobox', { name: /Language|Idioma/ })
    .selectOption(value);
}

test.describe('browser history', () => {
  test('Back returns to the language the entry was made in', async ({ page }) => {
    // The regression this exists for: the language was dropped on the way back, and the entry
    // was rewritten so pressing Back again could never recover it either.
    await page.goto('./?lang=pt&ref=John.3.16');
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    await chooseLanguage(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    expect(query(page)).toContain('lang=pt');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
    // And the Bible comes back with the language. `html[lang]` and the words are set by two
    // different statements, and the Bible by a third — asserting only the first would pass on an
    // English-worded page claiming to be Portuguese, which is exactly what used to happen.
    await expect(await headerButton(page, /Tradução/)).toContainText('BLIVRE');
  });

  test('Forward returns to the language that followed it', async ({ page }) => {
    await page.goto('./?lang=pt');
    await waitForApp(page);
    await chooseLanguage(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();

    await page.goForward();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filters/ })).toBeVisible();
  });

  test('Back returns to the passage that was open', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();

    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Isaiah 53:5');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Isaiah 53:5' })).toBeVisible();

    await page.goBack();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    expect(query(page)).toContain('ref=John.3.16');

    await page.goForward();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Isaiah 53:5' })).toBeVisible();
  });

  test('changing the translation does not add a step to go Back through', async ({ page }) => {
    // Deliberate, and worth pinning: `Explorer` replaces the entry rather than pushing one, so
    // Back returns to the previous *passage* and not to the previous text. A reader comparing
    // three translations of one verse should not have to press Back three times to leave it.
    await page.goto('./?ref=Gen.1.1');
    await waitForApp(page);
    await page.locator(ACTIVE).getByRole('searchbox').fill('John 3:16');
    await page.locator(ACTIVE).getByRole('searchbox').press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();

    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();
    await expect(await headerButton(page, /Translation/)).toContainText('KJV');
    // The picker moves the moment it is clicked; the address waits for the text to arrive, which
    // is a four-megabyte download. Pressing Back between the two would be a different test.
    await page.waitForURL(/t=kjv/);

    // One press, and the text change is skipped along with it: back at the first passage.
    await page.goBack();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Genesis 1:1' })).toBeVisible();
  });

  test('Back crosses between the two views', async ({ page }) => {
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);

    // The view switch's own link: the panel also offers "Read in Threads".
    await page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }).click();
    await waitForApp(page);
    expect(new URL(page.url()).pathname).toContain('threads');

    await page.goBack();
    await waitForApp(page);
    expect(new URL(page.url()).pathname).not.toContain('threads');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
  });

  test('a language chosen in the address survives a reload', async ({ page }) => {
    await page.goto('./?lang=pt');
    await waitForApp(page);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
  });

  test("an explicit language is not quietly replaced by the reader's own", async ({ browser }) => {
    // A Portuguese browser follows an English link. Before `plainLocaleFor`, the first click
    // dropped `lang=en` from the address and the next read filled the gap from the reader's own
    // language, turning the interface Portuguese under them.
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    await page.goto('./?lang=en&ref=John.3.16');
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Isaiah 53:5');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Isaiah 53:5' })).toBeVisible();

    expect(query(page)).toContain('lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });

  test('pressing Back repeatedly reaches the first entry without getting stuck', async ({
    page,
  }) => {
    // A sync that rewrites history can make Back a no-op: the entry is replaced as fast as it is
    // reached, and the reader is trapped on one page.
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);
    const search = page.locator(ACTIVE).getByRole('searchbox');
    for (const reference of ['Isaiah 53:5', 'Genesis 1:1', 'Psalm 23']) {
      await search.fill(reference);
      await search.press('Enter');
      await expect(page.locator(PANEL)).toContainText(reference.split(' ')[0] ?? '');
    }

    for (let step = 0; step < 3; step += 1) {
      await page.goBack();
    }
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    expect(query(page)).toContain('ref=John.3.16');
  });
});
