import { expect, test } from '@playwright/test';
import { ACTIVE, PANEL, collectErrors, openPassage, waitForApp } from './helpers.ts';

test.describe('searching the text', () => {
  test('words list the verses that contain them, and one opens', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitForApp(page);
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('living water');
    await search.press('Enter');
    const results = page
      .locator(ACTIVE)
      .getByRole('region', { name: 'Verses that contain the words' });
    await expect(results.getByRole('status')).toHaveText(/verses contain “living water”/);
    await expect(results.locator('mark').first()).toHaveText(/living water/i);
    await results.getByRole('button', { name: /John 4:10/ }).click();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 4:10' })).toBeVisible();
    await expect(results).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the results close with Escape', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    const search = page.locator(ACTIVE).getByRole('searchbox');
    await search.fill('shepherd');
    await search.press('Enter');
    const results = page
      .locator(ACTIVE)
      .getByRole('region', { name: 'Verses that contain the words' });
    await expect(results).toBeVisible();
    await search.press('Escape');
    await expect(results).toHaveCount(0);
  });
});

test.describe('the path between two passages', () => {
  test('is drawn as a chain of verses, and can be walked', async ({ page }) => {
    await openPassage(page, 'Ruth.1.16');
    const panel = page.locator(PANEL);
    await panel.getByRole('textbox', { name: 'Passage to find a path to' }).fill('John 3:16');
    await panel.getByRole('button', { name: 'Find', exact: true }).click();
    const summary = panel.getByRole('status').filter({ hasText: / to John 3:16 in / });
    await expect(summary).toHaveText(/^Ruth 1:16 to John 3:16 in \d+ links?:$/);
    const steps = panel.getByRole('list').last().getByRole('listitem');
    await expect(steps.first()).toContainText('Ruth 1:16');
    await expect(steps.last()).toContainText('John 3:16');

    await steps.nth(1).getByRole('button').click();
    await expect(summary).not.toHaveText(/^Ruth 1:16 /);
    await expect(panel.getByRole('heading', { level: 2 })).not.toHaveText('Ruth 1:16');
  });
});
