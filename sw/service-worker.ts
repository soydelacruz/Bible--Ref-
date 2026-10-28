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
 * weak signal doesn't hold the app back); the datasets are named by their content, so a stored copy
 * is served as it is and never refreshed, and a release that changes one moves it to a new name.
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
/** Every dataset file this release serves, each named by its content (see `datasetFileName`). */
declare const DATASET_FILES: readonly string[];
/** How many hex digits of its SHA-256 a dataset file's name carries. */
declare const HASH_LENGTH: number;
/** A hash of this version's files; a new version gets new caches. */
declare const VERSION: string;
/** The dataset format's version, which the data cache is keyed on. */
declare const SCHEMA_VERSION: number;

const PREFIX = 'bible-cross-references';
const SHELL_CACHE = `${PREFIX}-shell-${VERSION}`;
// Keyed on the dataset format, not on the build: datasets are large, and a release that leaves one
// unchanged leaves its name unchanged too, so keeping them across releases is the point. A rename
// is not destructive: `activate` carries the previous cache's contents across and `dataset` looks
// in older ones on a miss, so the only thing a bump costs is the name.
const DATA_CACHE = `${PREFIX}-data-v${String(SCHEMA_VERSION)}`;

const scope = new URL(self.registration.scope);
// Cached files are the same whatever the request's headers (they are named by their content, or
// are datasets), so lookups ignore `Vary`: some hosts vary on `Origin`, which module scripts send
// and the worker's own requests don't.
const LOOKUP: CacheQueryOptions = { ignoreVary: true };
const toUrl = (path: string) => new URL(path, scope).href;
const datasetUrls = new Set(DATASETS.map(toUrl));
const dataPath = new URL(`${DATA_DIRECTORY}/`, scope).pathname;
const isDataCache = (name: string) => name.startsWith(`${PREFIX}-data`);

const currentUrls = new Set(DATASET_FILES.map(toUrl));
const hashed = new RegExp(`(?:\\.([0-9a-f]{${String(HASH_LENGTH)}}))?\\.\\w+$`);
/**
 * Which dataset a URL holds, under any release's name for it: its path without the hash or the
 * extension. `translations/kjv.json` (from before datasets were named by content) and
 * `translations/kjv.1a2b3c4d5e6f.json` are the same Bible.
 */
const datasetName = (url: string) => new URL(url).pathname.replace(hashed, '');
const currentByName = new Map([...currentUrls].map((url) => [datasetName(url), url]));

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

/** The first digits of the SHA-256 of a response's bytes, as a dataset's name carries them. */
async function hashOf(response: Response): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, HASH_LENGTH);
}

/**
 * This release's version of every dataset the reader kept from an earlier one, stored before this
 * release takes over: the Bible they chose has to be on the device when they next go offline,
 * and this is the last moment the network is known to be there.
 *
 * A file whose bytes have not changed is moved rather than downloaded again; its new name says
 * what its bytes must hash to. That is every Bible the first time datasets are named by their
 * content, and since a release that leaves a dataset alone leaves its name alone too, that is the
 * only time it matters.
 */
async function bringUpToDate(data: Cache): Promise<void> {
  const older = new Map<string, { readonly from: string; readonly response: Response }>();
  for (const name of (await caches.keys()).filter(isDataCache)) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const url = currentByName.get(datasetName(request.url));
      if (
        url === undefined ||
        url === request.url ||
        older.has(url) ||
        (await data.match(url, LOOKUP)) !== undefined
      ) {
        continue;
      }
      const response = await cache.match(request, LOOKUP);
      if (response !== undefined) {
        older.set(url, { from: request.url, response });
      }
    }
  }
  const extension = (url: string) => url.slice(url.lastIndexOf('.'));
  await Promise.allSettled(
    [...older].map(async ([url, { from, response }]) => {
      // A file of another format (the links were JSON once) cannot be the same bytes.
      if (
        extension(from) === extension(url) &&
        (await hashOf(response)) === hashed.exec(url)?.[1]
      ) {
        await data.put(url, response);
      } else {
        await data.add(url);
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // The pages first and on their own: everything else can be fetched again, they cannot.
      await shell.addAll(PAGES.map(toUrl));
      await store(shell, FILES.map(toUrl));
      // The page has just downloaded the datasets, so these usually come from the HTTP cache.
      const data = await caches.open(DATA_CACHE);
      await store(data, [...datasetUrls]);
      await bringUpToDate(data);
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
  const urls = paths
    .filter((path): path is string => typeof path === 'string')
    .map(toUrl)
    // Only this release's own files. `store` keys on the whole URL, so `bsb.json?1`, `?2`, …
    // would each be a separate four-megabyte entry: anything that can reach this worker could
    // fill the reader's storage and push their offline copy out of it.
    .filter((url) => currentUrls.has(url));
  event.waitUntil(
    (async () => {
      await store(await caches.open(DATA_CACHE), urls);
    })(),
  );
});

/**
 * Deletes the files of earlier releases that this one has replaced, once the replacement is
 * stored (see `bringUpToDate`), and those of datasets this release no longer has. A file whose
 * replacement could not be fetched stays: it is the only copy of that dataset on the device, and
 * `sameDataset` will still offer it to a reader who is offline.
 */
async function dropReplaced(): Promise<void> {
  const data = await caches.open(DATA_CACHE);
  for (const request of await data.keys()) {
    if (currentUrls.has(request.url)) {
      continue;
    }
    const url = currentByName.get(datasetName(request.url));
    if (url === undefined || (await data.match(url, LOOKUP)) !== undefined) {
      await data.delete(request, LOOKUP);
    }
  }
}

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
          .filter((name) => isDataCache(name) && name !== DATA_CACHE)
          .map(async (name) => {
            await adoptDatasets(name);
            await caches.delete(name);
          }),
      );
      await dropReplaced();
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
    event.respondWith(dataset(request));
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
  const names = (await caches.keys()).filter((name) => isDataCache(name) && name !== DATA_CACHE);
  for (const name of names) {
    const response = await (await caches.open(name)).match(request, LOOKUP);
    if (response !== undefined) {
      await current.put(request, response.clone());
      return response;
    }
  }
  return undefined;
}

/**
 * Another version of the dataset a URL names, for when that file cannot be had: this release's,
 * or any other stored. A page of an earlier release, still open after this one took over, asks
 * for files the server no longer has; a reader offline may have only an earlier release's copy.
 * The app checks whatever it is given, and fetches again what it cannot read.
 *
 * This release's file, fetched in its place, is stored here: the page's own request to store
 * what it read names its release's file, which this one does not keep.
 */
async function sameDataset(data: Cache, url: string): Promise<Response | undefined> {
  const name = datasetName(url);
  const current = currentByName.get(name);
  const stored = current === undefined ? undefined : await data.match(current, LOOKUP);
  if (stored !== undefined) {
    return stored;
  }
  for (const request of await data.keys()) {
    if (datasetName(request.url) === name) {
      const response = await data.match(request, LOOKUP);
      if (response !== undefined) {
        return response;
      }
    }
  }
  if (current === undefined || current === url) {
    return undefined;
  }
  const response = await fetch(current);
  if (response.ok) {
    await data.put(current, response.clone());
  }
  return response;
}

/**
 * Datasets: a stored copy at once, with nothing to refresh, since a file's name changes whenever
 * its bytes do. This release's files are stored as they arrive.
 */
async function dataset(request: Request): Promise<Response> {
  const data = await caches.open(DATA_CACHE);
  const cached = (await data.match(request, LOOKUP)) ?? (await adoptedCopy(data, request));
  if (cached) {
    return cached;
  }
  let response: Response;
  try {
    response = await fetch(request);
  } catch (error) {
    const other = await sameDataset(data, request.url);
    if (other === undefined) {
      throw error;
    }
    return other;
  }
  if (response.ok && currentUrls.has(request.url)) {
    await data.put(request, response.clone());
  }
  if (!response.ok && !currentUrls.has(request.url)) {
    return (await sameDataset(data, request.url)) ?? response;
  }
  return response;
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
