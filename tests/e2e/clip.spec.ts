import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, headerButton, waitForApp } from './helpers.ts';

const SAVE_AS_VIDEO = /^Save as video$/;
const FILE_NAME = /^john-3-16-bible-soydelacruz-reference\.(webm|mp4)$/;
/** A clip lasts up to six seconds and is made as it plays; the software renderer adds to that. */
const RECORDING = { timeout: 30_000 };

/** The clip's status over the stage, while it is made and once it is. */
function clipStatus(page: Page) {
  return page.locator(ACTIVE).getByRole('region', { name: 'Video' });
}

/**
 * A verse in Arcs, its details left where they open: on a phone the sheet stays low, so the stage
 * the status sits on is in view.
 */
async function openVerse(page: Page): Promise<void> {
  await page.goto('./?ref=John.3.16');
  await waitForApp(page);
}

async function makeClip(page: Page): Promise<void> {
  await (await headerButton(page, SAVE_AS_VIDEO)).click();
  await expect(clipStatus(page).getByRole('status')).toHaveText('Your video is ready.', RECORDING);
}

/** Whether the bytes open the way a WebM (EBML) or an MP4 (`ftyp` box) file does. */
function isVideo(bytes: Uint8Array): boolean {
  const webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const mp4 = new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp';
  return webm || mp4;
}

test.describe('a short video of a passage', () => {
  test('is offered once a passage is chosen, next to the picture', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await expect(await headerButton(page, /^Save as image$/)).toBeVisible();
    await expect(page.locator(ACTIVE).getByRole('button', { name: SAVE_AS_VIDEO })).toHaveCount(0);

    await openVerse(page);
    await expect(await headerButton(page, SAVE_AS_VIDEO)).toBeVisible();
  });

  test('is made while its progress shows, then saved as a video file', async ({ page }) => {
    await openVerse(page);
    await (await headerButton(page, SAVE_AS_VIDEO)).click();
    const status = clipStatus(page);
    await expect(status.getByRole('status')).toHaveText('Making the video…');
    await expect(status.getByRole('progressbar', { name: 'Making the video…' })).toBeVisible();
    // The clip plays small in the status while it records.
    await expect(status.locator('canvas')).toHaveAttribute('width', '1080');
    await expect(status.getByRole('status')).toHaveText('Your video is ready.', RECORDING);

    const download = page.waitForEvent('download');
    await status.getByRole('button', { name: 'Save' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(FILE_NAME);
    const bytes = await readFile(await file.path());
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(isVideo(bytes)).toBe(true);

    await status.getByRole('button', { name: 'Close' }).click();
    await expect(status).toHaveCount(0);
  });

  test('is handed to the share sheet where the browser has one', async ({ page }) => {
    await page.addInitScript(() => {
      const shared: { name: string; type: string; size: number }[] = [];
      Object.assign(window, { sharedFiles: shared });
      Object.defineProperty(navigator, 'canShare', {
        value: (data?: ShareData) => (data?.files?.length ?? 0) > 0,
        configurable: true,
      });
      Object.defineProperty(navigator, 'share', {
        value: (data: ShareData) => {
          for (const file of data.files ?? []) {
            shared.push({ name: file.name, type: file.type, size: file.size });
          }
          return Promise.resolve();
        },
        configurable: true,
      });
    });
    await openVerse(page);
    await makeClip(page);
    await clipStatus(page).getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(
      () => (window as unknown as { sharedFiles: unknown[] }).sharedFiles,
    );
    expect(shared).toEqual([
      {
        name: expect.stringMatching(FILE_NAME) as unknown,
        type: expect.stringMatching(/^video\/(webm|mp4)$/) as unknown,
        size: expect.any(Number) as unknown,
      },
    ]);
  });

  test('can be stopped while it is made', async ({ page }) => {
    await openVerse(page);
    await (await headerButton(page, SAVE_AS_VIDEO)).click();
    const status = clipStatus(page);
    await expect(status.getByRole('status')).toHaveText('Making the video…');
    await status.getByRole('button', { name: 'Cancel' }).click();
    await expect(status).toHaveCount(0);
    await expect(await headerButton(page, SAVE_AS_VIDEO)).not.toHaveAttribute('aria-busy');
  });

  test('is still offered with reduced motion, and the page around it stays still', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVerse(page);
    await (await headerButton(page, SAVE_AS_VIDEO)).click();
    const status = clipStatus(page);
    await expect(status.getByRole('status')).toHaveText('Making the video…');
    // No entrance, and the clip isn't shown playing: only its last frame, once it is made.
    expect(await status.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'none',
    );
    await expect(status.locator('canvas')).toHaveCSS('opacity', '0');
    await expect(status.getByRole('status')).toHaveText('Your video is ready.', RECORDING);
    await expect(status.locator('canvas')).toHaveCSS('opacity', '1');
  });
});
