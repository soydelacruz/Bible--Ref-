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

/** The paths of every dataset the worker has stored. */
async function storedDatasets(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      if (name.includes('-data')) {
        for (const request of await (await caches.open(name)).keys()) {
          paths.push(new URL(request.url).pathname);
        }
      }
    }
    return paths.toSorted();
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
 * served — the BSB, the links and the words. Every test below would therefore
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

  test('a view never opened online opens offline too', async ({ page, context }) => {
    // A view's code is downloaded the first time it is opened, and this reader opened only the
    // arcs. The worker keeps every view's code as it installs, so the others are there anyway.
    await installWorker(page);
    await cutTheNetwork(context);
    await page.reload();
    await waitForApp(page);
    await page.locator(ACTIVE).getByRole('link', { name: 'Threads', exact: true }).click();
    await expect(page).toHaveURL(/threads\//);
    await expect(page.locator(`${ACTIVE} li[data-selected="true"]`)).toContainText(
      /For God so loved the world/,
    );
    await page.locator(ACTIVE).getByRole('link', { name: 'Clusters', exact: true }).click();
    await expect(page.locator(`${ACTIVE} canvas[role="img"]`)).toBeVisible();
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

  test("an upgrade from before datasets were named by content keeps the reader's Bible", async ({
    page,
    context,
  }) => {
    // The release before this one stored every dataset under a plain name (`kjv.json`) and the
    // links as JSON. A reader who had chosen the KJV must still have it the moment this release
    // takes over, without downloading it again: its bytes did not change, only its name.
    //
    // Two installs, a change of Bible and an offline reload: more than one test's usual time.
    test.slow();
    await installWorker(page);
    await openHeaderMenu(page, /Translation/);
    await page
      .locator(ACTIVE)
      .getByRole('radio', { name: /King James/ })
      .check();
    await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
    await expect
      .poll(
        async () => (await storedDatasets(page)).some((path) => /\/kjv\.\w{12}\.json$/.test(path)),
        {
          timeout: 30_000,
        },
      )
      .toBe(true);

    // Put the cache back the way that release left it.
    const kjv = await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.includes('-data'));
      const data = await caches.open(name ?? '');
      let named = '';
      for (const request of await data.keys()) {
        const path = new URL(request.url).pathname;
        const text = /^(.*\/translations\/kjv)\.[0-9a-f]{12}\.json$/.exec(path);
        const links = /^(.*\/cross-references\/openbible)\.[0-9a-f]{12}\.bin$/.exec(path);
        if (text) {
          const response = await data.match(request);
          if (response) await data.put(`${text[1] ?? ''}.json`, response);
          await data.delete(request);
          named = path;
        } else if (links) {
          await data.put(`${links[1] ?? ''}.json`, new Response('{"format":"cross-references"}'));
          await data.delete(request);
        }
      }
      return named;
    });
    expect(kjv).not.toBe('');

    const original = await readFile(WORKER, 'utf8');
    try {
      // The KJV cannot be downloaded from here on: if it reaches the new release, it was moved.
      await context.route('**/translations/kjv.*', (route) => route.abort());
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

      const stored = await storedDatasets(page);
      expect(stored).toContain(kjv);
      // The old names are gone once their replacements are in, the links' included.
      expect(stored.filter((path) => /\/(kjv|openbible)\.json$/.test(path))).toEqual([]);
      expect(stored.some((path) => /\/openbible\.\w{12}\.bin$/.test(path))).toBe(true);

      await context.unroute('**/translations/kjv.*');
      await cutTheNetwork(context);
      await page.reload();
      await waitForApp(page);
      await expect(page.locator(PANEL)).toContainText(/only begotten Son/);
      await restoreTheNetwork(context);
    } finally {
      await writeFile(WORKER, original);
    }
  });

  test("a Bible an earlier release's page is given in place of its own file is kept", async ({
    page,
    context,
  }) => {
    // A page loaded before this release took over asks for its release's name for a dataset,
    // which the server no longer has, and is given this release's file instead. Its own request
    // to store what it read names a file this release does not serve, so the worker has to keep
    // the file itself, or the Bible just downloaded is not there offline.
    await installWorker(page);
    expect((await storedDatasets(page)).some((path) => path.includes('/translations/web.'))).toBe(
      false,
    );
    // The host has no such file. (The preview server would answer with the app's page instead.)
    await context.route('**/translations/web.000000000000.json', (route) =>
      route.fulfill({ status: 404, body: 'Not found' }),
    );
    const status = await page.evaluate(async () => {
      const old = new URL('data/translations/web.000000000000.json', document.baseURI);
      return (await fetch(old)).status;
    });
    expect(status).toBe(200);
    await expect
      .poll(async () =>
        (await storedDatasets(page)).some((path) =>
          /\/translations\/web\.[0-9a-f]{12}\.json$/.test(path),
        ),
      )
      .toBe(true);
    expect((await storedDatasets(page)).some((path) => path.includes('web.000000000000'))).toBe(
      false,
    );
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
