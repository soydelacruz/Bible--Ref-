import { decodeDataset, type DecodeRequest } from '../../core/datasets/decoders.ts';
import { ValidationError } from '../../core/lib/validation.ts';
import { WorkerClient } from '../../core/lib/worker-rpc.ts';

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
  /** Size of the file as served (before any compression on the way). */
  readonly bytes: number;
  readonly downloadMs: number;
  /** Time spent reading the file: in the dataset worker for the files it reads. */
  readonly parseMs: number;
  /** Time the main thread spent on it after that: validating, and building in-memory indices. */
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

interface FetchedBytes {
  readonly buffer: ArrayBuffer;
  readonly report: Omit<DatasetLoadReport, 'parseMs' | 'processMs'>;
}

export interface FetchDatasetOptions {
  /**
   * Called once the file's bytes are in, before they are read. Reading a large file keeps the
   * page busy for a while; a download started here uses the connection meanwhile.
   */
  readonly onDownloaded?: () => void;
}

/** Fetches a generated dataset file (a path relative to the site root). */
async function fetchDatasetBytes(
  path: string,
  { onDownloaded }: FetchDatasetOptions = {},
): Promise<FetchedBytes> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  const downloadStart = performance.now();
  let response: Response;
  try {
    // A plain GET from the page, so the browser reuses the download the HTML preloaded: a worker's
    // own request could not, and would download the file a second time.
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
  const downloadMs = performance.now() - downloadStart;
  return { buffer, report: { path, url, bytes: buffer.byteLength, downloadMs } };
}

function parseJson(path: string, buffer: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new DatasetUnavailableError(path, 'the response is not valid JSON');
  }
}

/** Fetches a generated dataset file (a path relative to the site root) and parses its JSON. */
export async function fetchDataset(
  path: string,
  options: FetchDatasetOptions = {},
): Promise<FetchedDataset> {
  const { buffer, report } = await fetchDatasetBytes(path, options);
  const { value: json, ms: parseMs } = measure(() => parseJson(path, buffer));
  return { json, report: { ...report, parseMs } };
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

interface Loaded<T> {
  readonly value: T;
  readonly report: DatasetLoadReport;
}

/**
 * Fetches a dataset and reads it with `read`, healing a copy an earlier release left in the
 * offline cache.
 *
 * The offline cache keeps datasets across releases, and a file it holds may be one this release
 * cannot read: from before a format change, or damaged on its way in. If so, the copy is evicted
 * and fetched again before the reader is told anything is wrong. Without this, such a copy costs
 * every installed reader a broken load, and a reader who never comes back online would never
 * recover at all.
 */
async function loadHealing<T>(
  path: string,
  read: (fetched: FetchedBytes) => Promise<Loaded<T>>,
  options: FetchDatasetOptions,
): Promise<Loaded<T>> {
  const fetched = await fetchDatasetBytes(path, options);
  const { url } = fetched.report;
  try {
    return await read(fetched);
  } catch (error) {
    // Only a file this release cannot read is worth refetching. Any other failure — a bug while
    // building the indices, say — would be met again by the fresh copy, so retrying would just
    // download several megabytes twice on the way to the same error.
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    const evicted = await evictCachedDataset(url);
    try {
      return await read(await fetchDatasetBytes(path));
    } catch (retryError) {
      // Offline, most likely. Put the unreadable copy back rather than leaving the reader with
      // nothing: this release cannot use it, but a later one might, and deleting it would make
      // every future offline visit fail the same way with no way back.
      await restoreCachedDataset(url, evicted);
      throw retryError;
    }
  }
}

/** Fetches a JSON dataset and validates it with `parse`, on this thread (see `loadHealing`). */
export function loadDataset<T>(
  path: string,
  parse: (json: unknown) => T,
  options: FetchDatasetOptions = {},
): Promise<Loaded<T>> {
  return loadHealing(
    path,
    ({ buffer, report }) => {
      const { value: json, ms: parseMs } = measure(() => parseJson(path, buffer));
      const { value, ms: processMs } = measure(() => parse(json));
      return Promise.resolve({ value, report: { ...report, parseMs, processMs } });
    },
    options,
  );
}

/**
 * Reads the large datasets off the main thread: reading the links or a Bible's text took the page
 * away from the reader for half a second or more on a phone, at first load and at every change of
 * text. Started with the first download, so its script loads while the data does.
 */
const datasetWorker = new WorkerClient(() =>
  typeof Worker === 'function'
    ? new Worker(new URL('../../core/datasets/dataset.worker.ts', import.meta.url), {
        type: 'module',
      })
    : null,
);

/**
 * Fetches a dataset and has the dataset worker read it (see `decoders.ts`), handing it the bytes
 * rather than copying them; `accept` then takes what the worker built. Where no worker runs, the
 * same reading happens here. Heals a stale cached copy like `loadDataset`.
 */
export function loadDatasetOffThread<T>(
  path: string,
  request: DecodeRequest,
  accept: (value: unknown) => T,
  options: FetchDatasetOptions = {},
): Promise<Loaded<T>> {
  datasetWorker.warm();
  return loadHealing(
    path,
    async ({ buffer, report }) => {
      const start = performance.now();
      const decoded = await datasetWorker.run(
        { ...request, buffer },
        [buffer],
        (value) => value,
        async () => (await decodeDataset(request, buffer)).value,
      );
      const parseMs = performance.now() - start;
      const { value, ms: processMs } = measure(() => accept(decoded));
      return { value, report: { ...report, parseMs, processMs } };
    },
    options,
  );
}
