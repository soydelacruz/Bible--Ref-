/**
 * The offline cache. It makes repeat visits load from the device and lets the app work offline.
 *
 * The site lives under a path of a shared origin (trekhleb.dev/bible-cross-references/), so:
 * - the worker's scope is that path (browsers allow no wider scope for a worker served there), and
 *   it only ever handles requests under it;
 * - every cache it creates starts with `PREFIX`, and it only ever reads or deletes its own caches,
 *   never those of other sites on the origin.
 *
 * Strategies: the app's code and pages are cached per version and served from the cache
 * (pages network-first, so a new version shows up at once, but not for longer than 1.5 s, so a
 * weak signal doesn't hold the app back); the datasets are served from the cache and refreshed in
 * the background (stale-while-revalidate).
 */

declare const self: ServiceWorkerGlobalScope;

// Injected by the build (`offline()` in vite/offline.ts): paths relative to the worker's scope.
/** The app's pages. Without them there is no app offline, so they have to be stored. */
declare const PAGES: readonly string[];
/** This version's code, styles and icons. */
declare const FILES: readonly string[];
/** The datasets a first visit needs, cached across versions. */
declare const DATASETS: readonly string[];
/** Where all datasets live, so the ones loaded later (another translation) are cached too. */
declare const DATA_DIRECTORY: string;
/** A hash of this version's files; a new version gets new caches. */
declare const VERSION: string;
/** The dataset format's version, which the data cache is keyed on. */
declare const SCHEMA_VERSION: number;

const PREFIX = 'bible-cross-references';
const SHELL_CACHE = `${PREFIX}-shell-${VERSION}`;
// Keyed on the dataset format, not on the build: datasets are large and their URLs carry no
// content hash, so keeping them across releases is the point. But a release that changes
// what a dataset file looks like cannot read the one already stored, and the reader has no
// way to clear it — so a format change retires the old cache instead of inheriting it.
// A rename is not destructive: `activate` carries the previous cache's contents across and
// `dataset` looks in older ones on a miss, so the only thing a bump costs is the name.
const DATA_CACHE = `${PREFIX}-data-v${String(SCHEMA_VERSION)}`;

const scope = new URL(self.registration.scope);
// Cached files are the same whatever the request's headers (they are named by their content, or
// are datasets), so lookups ignore `Vary`: some hosts vary on `Origin`, which module scripts send
// and the worker's own requests don't.
const LOOKUP: CacheQueryOptions = { ignoreVary: true };
const toUrl = (path: string) => new URL(path, scope).href;
const datasetUrls = new Set(DATASETS.map(toUrl));
const dataPath = new URL(`${DATA_DIRECTORY}/`, scope).pathname;

/** Stores what it can, and says what it could not: one missing file is not worth an app that
 * never works offline. */
async function store(cache: Cache, urls: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      if (!(await cache.match(url, LOOKUP))) {
        await cache.add(url);
      }
    }),
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`Offline cache: ${String(failed)} of ${String(urls.length)} files were skipped.`);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // The pages first and on their own: everything else can be fetched again, they cannot.
      await shell.addAll(PAGES.map(toUrl));
      await store(shell, FILES.map(toUrl));
      // The page has just downloaded the datasets, so these usually come from the HTTP cache.
      await store(await caches.open(DATA_CACHE), [...datasetUrls]);
      await self.skipWaiting();
    })(),
  );
});

/**
 * The page tells the worker which datasets it is actually using, which is how a translation other
 * than the default one gets stored: on the visit it was chosen, the page had already fetched it
 * before this worker existed, so nothing else would ever put it here.
 */
self.addEventListener('message', (event) => {
  const message: unknown = event.data;
  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    message.type !== 'cache-datasets' ||
    !('paths' in message) ||
    !Array.isArray(message.paths)
  ) {
    return;
  }
  // `Array.isArray` narrows only to `any[]`, so the elements arrive untyped even here. This
  // is a message from the page, which is the one input the worker does not control.
  const paths: readonly unknown[] = message.paths;
  const dataDirectory = new URL(`${DATA_DIRECTORY}/`, scope).href;
  const urls = paths
    .filter((path): path is string => typeof path === 'string')
    .map(toUrl)
    // Under the data directory, and with no query. `store` keys on the whole URL, so
    // `bsb.json?1`, `?2`, … would each be a separate four-megabyte entry: anything that can
    // reach this worker could fill the reader's storage and push their offline copy out of it.
    .filter((url) => url.startsWith(dataDirectory) && !url.includes('?') && !url.includes('#'));
  event.waitUntil(
    (async () => {
      await store(await caches.open(DATA_CACHE), urls);
    })(),
  );
});

/** Moves everything a previous release cached under another name into this release's cache. */
async function adoptDatasets(from: string): Promise<void> {
  const previous = await caches.open(from);
  const current = await caches.open(DATA_CACHE);
  for (const request of await previous.keys()) {
    if ((await current.match(request, LOOKUP)) !== undefined) {
      continue;
    }
    const response = await previous.match(request, LOOKUP);
    if (response !== undefined) {
      await current.put(request, response);
    }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const oldShells = names.filter(
        (name) => name.startsWith(`${PREFIX}-shell-`) && name !== SHELL_CACHE,
      );
      await Promise.all(oldShells.map((name) => caches.delete(name)));

      // Datasets a previous release stored are carried across, not dropped.
      //
      // The reader chose that Bible and it is already on their device; making them fetch four
      // megabytes again — over mobile data, or not at all because they are now on a plane — is
      // the worst thing an upgrade can do to them. Deleting the old cache and hoping the new one
      // refills is what breaks that, and it breaks hardest for exactly the reader who went
      // offline right after upgrading.
      await Promise.all(
        names
          .filter((name) => name.startsWith(`${PREFIX}-data`) && name !== DATA_CACHE)
          .map(async (name) => {
            await adoptDatasets(name);
            await caches.delete(name);
          }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  ) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(page(event, request));
  } else if (url.pathname.startsWith(dataPath)) {
    event.respondWith(dataset(event, request));
  } else {
    event.respondWith(file(request));
  }
});

/**
 * How long a page waits for the network before this version's copy is shown instead. Long enough
 * for any working connection to answer (a new version then shows at once), short enough that a
 * weak signal doesn't hold an app that is already on the device: answered after 5 s, the page
 * took 7.1 s to appear instead of 1.8 s.
 */
const PAGE_NETWORK_TIMEOUT_MS = 1500;

/**
 * Pages: the network first, so a new version shows at once; this version's copy offline, or when
 * the network is slow to answer.
 *
 * The late answer is not stored. The stored page belongs with this version's files, which are what
 * it loads; a newer page is the next version's, and its worker stores it when it installs — which
 * the same visit starts, since the browser checks for a new worker on every navigation.
 */
async function page(event: FetchEvent, request: Request): Promise<Response> {
  const network = fetch(request);
  const shell = await caches.open(SHELL_CACHE);
  // `?ref=…` only selects a passage: every passage of a page is the same file.
  const cached = await shell.match(request, { ...LOOKUP, ignoreSearch: true });
  if (cached === undefined) {
    return network.catch(() => Response.error());
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, PAGE_NETWORK_TIMEOUT_MS, undefined);
  });
  const answered = network.catch(() => undefined);
  const first = await Promise.race([answered, late]);
  clearTimeout(timer);
  if (first === undefined) {
    // Offline or slow: the copy now. A slow answer still completes, rather than being cut off.
    event.waitUntil(answered);
    return cached;
  }
  return first;
}

/**
 * A copy a previous release left behind, promoted into this release's cache.
 *
 * `activate` moves them all across, but the release being replaced keeps running until the page
 * reloads and can write one more file under its own name afterwards — the reader switching
 * translation during the upgrade is exactly when that happens. Looking here on a miss means that
 * copy is found rather than re-downloaded, whenever it was written.
 */
async function adoptedCopy(current: Cache, request: Request): Promise<Response | undefined> {
  const names = (await caches.keys()).filter(
    (name) => name.startsWith(`${PREFIX}-data`) && name !== DATA_CACHE,
  );
  for (const name of names) {
    const response = await (await caches.open(name)).match(request, LOOKUP);
    if (response !== undefined) {
      await current.put(request, response.clone());
      return response;
    }
  }
  return undefined;
}

/** Datasets: the cached copy at once, refreshed in the background for the next visit. */
async function dataset(event: FetchEvent, request: Request): Promise<Response> {
  const cache = await caches.open(DATA_CACHE);
  const cached = (await cache.match(request, LOOKUP)) ?? (await adoptedCopy(cache, request));
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

/**
 * The app's files: named by their content, so the cached copy is always right. One that is
 * missing — a download that failed while this version was installing — is stored as it is
 * fetched, instead of being absent offline until the next release.
 */
async function file(request: Request): Promise<Response> {
  const shell = await caches.open(SHELL_CACHE);
  const cached = await shell.match(request, LOOKUP);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    await shell.put(request, response.clone());
  }
  return response;
}
