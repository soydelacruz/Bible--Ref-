import { expect, test, type Page } from '@playwright/test';
import { ACTIVE, PANEL, waitForApp, waitForDrawing } from './helpers.ts';

/**
 * A view is downloaded and drawn the first time it is opened, not with the page: a reader who
 * never opens one pays nothing for it. Once open it stays mounted, so going back is instant.
 *
 * Without the offline cache: as it installs, the worker keeps every view's code for later, in the
 * background, which is not the page asking for it (see offline.spec.ts); and once it serves the
 * page, the page's requests can no longer be held here.
 */
test.use({ serviceWorkers: 'block' });

/** The paths the page has asked the server for, from now on, in order. */
function recordRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    paths.push(new URL(request.url()).pathname);
  });
  return paths;
}

function matching(paths: readonly string[], pattern: RegExp): string[] {
  return paths.filter((path) => pattern.test(path));
}

/** Each view's own code; the arcs' brings Three.js with it. */
const THREADS_CODE = /\/ThreadsExplorer-[\w-]+\.js$/;
const CLUSTERS_CODE = /\/ClustersExplorer-[\w-]+\.js$/;
const ARCS_CODE = /\/(ArcsExplorer|three)-[\w-]+\.js$/;
/** What Threads reads beside the text when it is the NET: the notes on the chapter's book. */
const THREADS_NOTES = /\/data\/notes\/net\/John\.json$/;

/**
 * Long enough for a view the page had mounted out of sight to have asked for its code and its
 * data: they used to be requested before the arcs had finished drawing.
 */
const MOMENT_MS = 1500;

async function switchTo(page: Page, view: 'Arcs' | 'Threads' | 'Clusters'): Promise<void> {
  await page.locator(ACTIVE).getByRole('link', { name: view, exact: true }).click();
}

/** Waits for a view to be the one shown: a switch to one opened for the first time waits for it. */
async function expectShown(page: Page, view: 'arcs' | 'threads' | 'clusters'): Promise<void> {
  await expect(page.locator(ACTIVE)).toHaveAttribute('data-view', view);
}

test.describe('opening a view', () => {
  test('downloads a view the first time it is opened, and keeps it from then on', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    // In the NET, Threads reads the notes on the book it opens at as well as its code.
    await page.goto('./?t=net');
    await waitForApp(page);
    await page.waitForTimeout(MOMENT_MS);
    expect(matching(requested, THREADS_CODE)).toEqual([]);
    expect(matching(requested, THREADS_NOTES)).toEqual([]);
    expect(matching(requested, CLUSTERS_CODE)).toEqual([]);

    await switchTo(page, 'Threads');
    await expectShown(page, 'threads');
    await expect(page).toHaveURL(/threads\//);
    await expect(page.locator(ACTIVE)).toContainText(/In the beginning was the Word/);
    await expect.poll(() => matching(requested, THREADS_NOTES)).toHaveLength(1);
    expect(matching(requested, THREADS_CODE)).toHaveLength(1);
    expect(matching(requested, CLUSTERS_CODE)).toEqual([]);
    // Marked, to tell the view that was left from one drawn afresh.
    await page.locator('[data-view="threads"]').evaluate((view) => {
      view.setAttribute('data-kept', '');
    });

    await switchTo(page, 'Clusters');
    await expectShown(page, 'clusters');
    await expect(page.locator(`${ACTIVE} canvas[role="img"]`)).toBeVisible();
    expect(matching(requested, CLUSTERS_CODE)).toHaveLength(1);

    // Back to a view already open: the same one, at once, with nothing downloaded again.
    await switchTo(page, 'Threads');
    await expectShown(page, 'threads');
    await expect(page.locator(ACTIVE)).toHaveAttribute('data-kept');
    expect(matching(requested, THREADS_CODE)).toHaveLength(1);
    expect(matching(requested, THREADS_NOTES)).toHaveLength(1);
  });

  test('a page that opens on Threads downloads nothing of the arcs until they are opened', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('./threads/?ref=John.3.16');
    await waitForApp(page);
    await page.waitForTimeout(MOMENT_MS);
    expect(matching(requested, ARCS_CODE)).toEqual([]);
    expect(matching(requested, CLUSTERS_CODE)).toEqual([]);

    await switchTo(page, 'Arcs');
    await expectShown(page, 'arcs');
    await waitForDrawing(page);
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    expect(matching(requested, ARCS_CODE)).toHaveLength(2);
  });

  test('shows the loading arcs while a view’s code is on its way', async ({ page }) => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(CLUSTERS_CODE, async (route) => {
      await released;
      await route.continue();
    });
    await page.goto('./?ref=John.3.16');
    await waitForApp(page);

    await switchTo(page, 'Clusters');
    // The press is answered promptly all the same: the view is the one shown, loading in place.
    await expectShown(page, 'clusters');
    await expect(page).toHaveURL(/clusters\//);
    await expect(page.locator(ACTIVE).getByRole('status')).toHaveText('Loading Clusters…');

    release();
    await expect(page.locator(`${ACTIVE} canvas[role="img"]`)).toBeVisible();
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    await expect(page.getByText('Loading Clusters…')).toHaveCount(0);
  });

  test('the first switch into the arcs still carries the passage to them', async ({ page }) => {
    // The beacon lands as the switch ends, which waits for the arcs' first picture: on CI's
    // software renderer, drawing every link takes ten seconds or more.
    test.slow();
    await page.goto('./threads/?ref=John.3.16');
    await waitForApp(page);
    // Every beacon shown from now on, and whether it landed.
    await page.evaluate(() => {
      const beacons: { name: string; landed: boolean }[] = [];
      Object.assign(window, { beacons });
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.hasAttribute('data-passage-beacon')) {
              const beacon = { name: node.textContent, landed: false };
              beacons.push(beacon);
              new MutationObserver(() => {
                beacon.landed ||= node.hasAttribute('data-landed');
              }).observe(node, { attributes: true, attributeFilter: ['data-landed'] });
            }
          }
        }
      }).observe(document.body, { childList: true });
    });
    const beacons = () =>
      page.evaluate(
        () => (window as unknown as { beacons: { name: string; landed: boolean }[] }).beacons,
      );

    await switchTo(page, 'Arcs');
    await expectShown(page, 'arcs');
    await expect(page).toHaveURL(/ref=John\.3\.16/);
    await expect(page.locator(PANEL).getByRole('heading', { name: 'John 3:16' })).toBeVisible();
    await expect.poll(beacons, { timeout: 60_000 }).toEqual([{ name: 'John 3:16', landed: true }]);
  });
});
