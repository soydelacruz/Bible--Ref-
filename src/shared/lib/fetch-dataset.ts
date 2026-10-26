import { ValidationError } from '../../core/lib/validation.ts';

/** The caches this app owns; see `sw/service-worker.ts`, which uses the same prefix. */
const CACHE_PREFIX = 'bible-cross-references';

interface CachedCopy {
  readonly name: string;
  readonly response: Response;
}

/** Timing and size of a loaded dataset file, shown on the debug page. */
export interface DatasetLoadReport {
  readonly path: string;
  readonly url: string;
  /** Uncompressed size of the file. */
  readonly bytes: number;
  readonly downloadMs: number;
  readonly parseMs: number;
  /** Time spent validating the file and building in-memory indices. */
  readonly processMs: number;
}

export class DatasetUnavailableError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(
      `Dataset "${path}" is unavailable (${reason}). ` +
        'Generate the datasets with `npm run data` (see README.md).',
    );
    this.name = 'DatasetUnavailableError';
    this.path = path;
  }
}

export interface FetchedDataset {
  readonly json: unknown;
  readonly report: Omit<DatasetLoadReport, 'processMs'>;
}

export interface FetchDatasetOptions {
  /**
   * Called once the file's bytes are in, before they are read. Reading a large file keeps the
   * page busy for a while; a download started here uses the connection meanwhile.
   */
  readonly onDownloaded?: () => void;
}

/** Fetches a generated dataset file (a path relative to the site root) and parses its JSON. */
export async function fetchDataset(
  path: string,
  { onDownloaded }: FetchDatasetOptions = {},
): Promise<FetchedDataset> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  const downloadStart = performance.now();
  let response: Response;
  try {
    // A plain GET, so the browser reuses the download the HTML preloaded.
    response = await fetch(url);
  } catch (error) {
    throw new DatasetUnavailableError(
      path,
      error instanceof Error ? error.message : 'network error',
    );
  }
  if (!response.ok) {
    throw new DatasetUnavailableError(path, `HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  onDownloaded?.();
  const text = new TextDecoder().decode(buffer);
  const downloadMs = performance.now() - downloadStart;

  const parseStart = performance.now();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DatasetUnavailableError(path, 'the response is not valid JSON');
  }
  const parseMs = performance.now() - parseStart;

  return { json, report: { path, url, bytes: buffer.byteLength, downloadMs, parseMs } };
}

/** Measures how long a synchronous step takes. */
export function measure<T>(step: () => T): { readonly value: T; readonly ms: number } {
  const start = performance.now();
  const value = step();
  return { value, ms: performance.now() - start };
}

/**
 * Drops a dataset from every offline cache that holds it, so the next fetch goes to the network.
 *
 * Only called for a file that failed validation, which is a file the app cannot use: losing it
 * costs nothing, and keeping it would mean the reader meets the same error on every visit.
 */
async function evictCachedDataset(url: string): Promise<CachedCopy | null> {
  if (!('caches' in globalThis)) {
    return null;
  }
  try {
    // Only this app's caches. The worker is careful to touch nothing but its own, and code on
    // the page should hold to the same line: the origin may host other projects one day.
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    for (const name of names) {
      const cache = await caches.open(name);
      const response = await cache.match(url);
      if (response !== undefined && (await cache.delete(url))) {
        // Kept so it can be put back: a file this release cannot read is still the only copy an
        // offline reader has, and losing it would cost them the app until they are next online.
        return { name, response };
      }
    }
  } catch {
    // A browser that refuses cache access (private mode, a disabled storage API) still gets the
    // network retry; there is simply nothing to evict first.
  }
  return null;
}

/** Puts an evicted copy back, for when the fresh one never arrived. */
async function restoreCachedDataset(url: string, copy: CachedCopy | null): Promise<void> {
  if (copy === null) {
    return;
  }
  try {
    await (await caches.open(copy.name)).put(url, copy.response);
  } catch {
    // Nothing more to try; the reader is no worse off than if the eviction had succeeded.
  }
}

/**
 * Fetches a dataset and validates it, healing a copy an earlier release left in the offline cache.
 *
 * Datasets live at URLs with no content hash and the offline cache keeps them across releases, so
 * the first load after a deployment validates the *previous* release's file. If this release ever
 * stops accepting that file, the stale copy is evicted and fetched again before the reader is told
 * anything is wrong. Without this, a schema change costs every installed reader a broken load, and
 * a reader who never comes back online would never recover at all.
 */
export async function loadDataset<T>(
  path: string,
  parse: (json: unknown) => T,
  options: FetchDatasetOptions = {},
): Promise<{ readonly value: T; readonly report: DatasetLoadReport }> {
  const fetched = await fetchDataset(path, options);
  try {
    const { value, ms } = measure(() => parse(fetched.json));
    return { value, report: { ...fetched.report, processMs: ms } };
  } catch (error) {
    // Only a file this release cannot read is worth refetching. Any other failure — a bug while
    // building the indices, say — would be met again by the fresh copy, so retrying would just
    // download several megabytes twice on the way to the same error.
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    const evicted = await evictCachedDataset(fetched.report.url);
    try {
      const fresh = await fetchDataset(path);
      const { value, ms } = measure(() => parse(fresh.json));
      return { value, report: { ...fresh.report, processMs: ms } };
    } catch (retryError) {
      // Offline, most likely. Put the unreadable copy back rather than leaving the reader with
      // nothing: this release cannot use it, but a later one might, and deleting it would make
      // every future offline visit fail the same way with no way back.
      await restoreCachedDataset(fetched.report.url, evicted);
      throw retryError;
    }
  }
}
