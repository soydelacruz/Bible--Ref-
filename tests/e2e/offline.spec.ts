import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp, openHeaderMenu } from './helpers.ts';

const WORKER = resolve(import.meta.dirname, '../../dist/sw.js');

/**
 * These rewrite the built worker to act out a release, so they run one at a time and only in one
 * project; the file is always put back.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(
    test.info().project.name !== 'offline',
    'Only the offline project may write dist/sw.js.',
  );
});

/** Everything the worker has stored, by cache name. */
async function cacheState(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const out: Record<string, number> = {};
    for (const name of names) {
      out[name] = (await (await caches.open(name)).keys()).length;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    return { caches: out, registered: Boolean(registration?.active) };
  });
}

async function installWorker(page: Page): Promise<void> {
  await page.goto('./?ref=John.3.16');
  await waitForApp(page);
  await expect
    .poll(async () => (await cacheState(page)).registered, { timeout: 30_000 })
    .toBe(true);
  await expect
    .poll(async () => Object.keys((await cacheState(page)).caches).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
}

/**
 * Cuts the network for real.
 *
 * `context.setOffline(true)` does not reach fetches the service worker makes. Measured against
 * this build: with it set and the page reloaded, the server was still asked for — and still
 * served — `bsb.json`, `openbible.json` and `stepbible.json`. Every test below would therefore
 * have passed with an empty cache, which is the opposite of what they are for.
 *
 * Aborting the context's routes does reach them, so these tests are about the cache rather than
 * about a server that happened to still be listening. `setOffline` stays for `navigator.onLine`,
 * which the app reads.
 */
async function cutTheNetwork(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route('**/*', (route) => route.abort());
}

/** Puts it back. */
async function restoreTheNetwork(context: BrowserContext): Promise<void> {
  await context.unroute('**/*');
  await context.setOffline(false);
}

test.describe('the offline cache', () => {
  test('stores the app and its data on the first visit', async ({ page }) => {
    await installWorker(page);
    const { caches: stored } = await cacheState(page);
    const shell = Object.keys(stored).find((name) => name.includes('-shell-'));
    expect(shell).toBeTruthy();
    expect(stored[shell ?? '']).toBeGreaterThan(10);
    // Found by its prefix, not its full name: both caches carry a version, the shell's being the
    // build's content hash and the data's the dataset format's number.
    const data = Object.keys(stored).find((name) => name.includes('-data'));
    expect(data).toBeTruthy();
    expect(stored[data ?? '']).toBeGreaterThanOrEqual(2);
  });

  test('the app still works with the network gone', async ({ page, context }) => {
    await installWorker(page);
    await cutTheNetwork(context);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    await expect(page.locator(PANEL)).toContainText(/For God so loved the world/);
    await restoreTheNetwork(context);
  });

  test('a translation chosen while online is there offline too', async ({ page, context }) => {
    await installWorker(page);
    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
    await expect
      .poll(
        async () => {
          const { caches: stored } = await cacheState(page);
          const name = Object.keys(stored).find((key) => key.includes('-data'));
          return stored[name ?? ''] ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(3);

    await cutTheNetwork(context);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
    await restoreTheNetwork(context);
  });

  test('a new release replaces the old cache instead of being stuck behind it', async ({
    page,
  }) => {
    await installWorker(page);
    const before = Object.keys((await cacheState(page)).caches).find((name) =>
      name.includes('-shell-'),
    );
    expect(before).toBeTruthy();

    const original = await readFile(WORKER, 'utf8');
    try {
      // What a deploy looks like to a browser: the same URL, different bytes.
      await writeFile(
        WORKER,
        original.replace(/const VERSION = "(\w+)"/, 'const VERSION = "next"'),
      );
      await page.reload();
      await waitForApp(page);

      await expect
        .poll(
          async () =>
            Object.keys((await cacheState(page)).caches).find((name) => name.includes('-shell-')),
          { timeout: 30_000 },
        )
        .toBe('bible-cross-references-shell-next');
      // The old one is gone, not left to grow forever.
      const { caches: after } = await cacheState(page);
      expect(Object.keys(after)).not.toContain(before);
    } finally {
      await writeFile(WORKER, original);
    }
  });

  test("a release that renames the data cache keeps the reader's own Bible", async ({
    page,
    context,
  }) => {
    // The failure this exists for: a reader who had chosen the KJV upgraded, the new worker
    // started a cache under a new name, and the old one — the only copy of their Bible — was
    // deleted. They were fine until they went offline, and then the app was a dead screen until
    // they were next online. Carrying the old cache across costs nothing and avoids all of it.
    await installWorker(page);
    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
    await expect
      .poll(
        async () => {
          const { caches: stored } = await cacheState(page);
          const name = Object.keys(stored).find((key) => key.includes('-data'));
          return stored[name ?? ''] ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(3);

    const original = await readFile(WORKER, 'utf8');
    try {
      // A release that changes both names, which is what a dataset format bump looks like.
      await writeFile(
        WORKER,
        original
          .replace(/const VERSION = "(\w+)"/, 'const VERSION = "next"')
          .replace(/const SCHEMA_VERSION = (\d+)/, 'const SCHEMA_VERSION = 99'),
      );
      await page.reload();
      await waitForApp(page);
      await expect
        .poll(
          async () =>
            Object.keys((await cacheState(page)).caches).some((name) => name.includes('-data-v99')),
          { timeout: 30_000 },
        )
        .toBe(true);

      // The KJV came across rather than being left behind with the old name.
      await cutTheNetwork(context);
      await page.reload();
      await waitForApp(page);
      await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
      await restoreTheNetwork(context);
    } finally {
      await writeFile(WORKER, original);
    }
  });

  test('a worker that withdraws itself clears everything, in one visit', async ({ page }) => {
    await installWorker(page);
    const original = await readFile(WORKER, 'utf8');
    try {
      // The escape hatch documented in README.md: deploy this and the cache is gone.
      await writeFile(
        WORKER,
        `self.addEventListener('install', () => self.skipWaiting());
         self.addEventListener('activate', (event) => {
           event.waitUntil((async () => {
             for (const name of await caches.keys()) {
               if (name.startsWith('bible-cross-references')) await caches.delete(name);
             }
             await self.registration.unregister();
           })());
         });`,
      );
      await page.reload();
      await waitForApp(page);

      await expect
        .poll(async () => Object.keys((await cacheState(page)).caches).length, { timeout: 30_000 })
        .toBe(0);
      // And the site still works, as an ordinary one.
      await expect(page.locator(`${ACTIVE} canvas`).first()).toBeVisible();
    } finally {
      await writeFile(WORKER, original);
      await page.goto('./');
      await page.evaluate(async () => {
        for (const registration of await navigator.serviceWorker.getRegistrations()) {
          await registration.unregister();
        }
        for (const name of await caches.keys()) {
          await caches.delete(name);
        }
      });
    }
  });
});

test.describe('the install guide', () => {
  test('opens from the footer and shows the steps for a device', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await page.locator(`${ACTIVE} footer`).getByRole('button', { name: 'Install the app' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'iPhone', exact: true }).click();
    await expect(dialog).toContainText(/Add to Home Screen/);
    await dialog.getByRole('button', { name: 'Desktop', exact: true }).click();
    await expect(dialog).toContainText(/address bar/);
  });

  test('opens straight from #install, and gives the address back when closed', async ({ page }) => {
    await page.goto('./?ref=John.3.16#install');
    await waitForApp(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\?ref=John\.3\.16$/);
  });
});
