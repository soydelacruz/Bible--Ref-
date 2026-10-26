import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, openPanel, waitForApp } from './helpers.ts';

/** Opens the app in a language, with the details of a passage in view. */
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`./${query}`);
  await waitForApp(page);
  await openPanel(page);
}

test.describe('reading in Spanish', () => {
  test('a link that names the language opens the app in it, with its Bible', async ({ page }) => {
    await open(page, '?lang=es');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Traducción/ })).toContainText(
      'RV1909',
    );
  });

  test('a reference can be typed in Spanish, under Spanish book names', async ({ page }) => {
    await open(page, '?lang=es');
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Génesis 1:1');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Génesis 1:1' })).toBeVisible();
    await search.fill('jn 3 16');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Juan 3:16' })).toBeVisible();
  });
});

test.describe('reading in Portuguese', () => {
  test('a link that names the language opens the app in it', async ({ page }) => {
    await open(page, '?lang=pt');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });

  test('a browser that asks for Portuguese gets it, and its Bible, without being asked', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    await page.goto('./');
    await waitForApp(page);
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Tradução/ })).toBeVisible();
    // The Portuguese Bible comes with the Portuguese interface.
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Tradução/ })).toContainText(
      'BLIVRE',
    );
    await context.close();
  });

  test('the verses are the Portuguese text, under Portuguese book names', async ({ page }) => {
    await open(page, '?lang=pt&ref=John.3.16');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'João 3:16' })).toBeVisible();
    await expect(page.locator(PANEL)).toContainText('Porque Deus amou ao mundo');
    await expect(page.locator(PANEL).getByText('Gênesis 22:12').first()).toBeVisible();
  });

  test('a reference can be typed in Portuguese, accents or not', async ({ page }) => {
    await open(page, '?lang=pt');
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Gênesis 1:1');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Gênesis 1:1' })).toBeVisible();
    await search.fill('salmos 23');
    await search.press('Enter');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Salmo 23' })).toBeVisible();
  });

  test('a reference it cannot read says so in Portuguese', async ({ page }) => {
    await open(page, '?lang=pt');
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('Hesitações 4:4');
    await search.press('Enter');
    await expect(page.locator(ACTIVE).getByRole('alert')).toContainText('Nenhum livro se chama');
  });

  test('counts are written the way a Brazilian writes them', async ({ page }) => {
    await open(page, '?lang=pt');
    await expect(page.getByText(/31\.102 versículos/)).toBeVisible();
  });

  test('the Hebrew words of a verse are named in Portuguese', async ({ page }) => {
    await open(page, '?lang=pt&ref=Gen.1.1');
    await expect(
      page.locator(PANEL).getByRole('button', { name: /Mesma palavra hebraica/ }),
    ).toBeVisible();
  });
});

test.describe('choosing a language', () => {
  test('the picker groups the translations under their language', async ({ page }) => {
    await open(page, '');
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Translation/ })
      .click();
    const menu = page.locator(ACTIVE).getByRole('radiogroup', { name: 'Translation' });
    await expect(menu.getByText('English', { exact: true })).toBeVisible();
    await expect(menu.getByText('Português', { exact: true })).toBeVisible();
    await expect(menu.getByRole('radio', { name: /Bíblia Livre/ })).toBeVisible();
  });

  test('the interface language is chosen in the same menu, and remembered', async ({ page }) => {
    await open(page, '');
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Translation/ })
      .click();
    await page.locator(ACTIVE).getByLabel('Language').selectOption('pt');
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
    await expect(page).toHaveURL(/lang=pt/);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
  });

  test('changing the text leaves the interface language alone', async ({ page }) => {
    await open(page, '?lang=pt');
    await page
      .locator(ACTIVE)
      .getByRole('button', { name: /Tradução/ })
      .click();
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .click();
    // The words stay Portuguese; only the Bible changed.
    await expect(page.locator(ACTIVE).getByRole('button', { name: /Filtros/ })).toBeVisible();
    await expect(page).toHaveURL(/t=kjv/);
  });

  test('a shared link carries both the text and the language', async ({ page }) => {
    await open(page, '?lang=pt&t=kjv&ref=Ps.23.1');
    await expect(page.locator(PANEL).getByRole('heading', { name: 'Salmo 23:1' })).toBeVisible();
    // Brackets and all: they mark the words the translators supplied rather than found in the
    // Hebrew, which is the KJV's own convention and not ours to quietly drop.
    await expect(page.locator(PANEL)).toContainText('The LORD [is] my shepherd');
  });
});
