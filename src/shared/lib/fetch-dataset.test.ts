import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeCrossReferences } from '../../core/datasets/cross-references-binary.ts';
import {
  acceptCrossReferenceTables,
  decodeDataset,
  parseDecodeMessage,
  type DecodeRequest,
} from '../../core/datasets/decoders.ts';
import { ValidationError } from '../../core/lib/validation.ts';
import { serveRequests } from '../../core/lib/worker-rpc.ts';
import { createCrossReferencesFile } from '../../test-utils/fixtures.ts';
import {
  DatasetUnavailableError,
  fetchDataset,
  loadDataset,
  loadDatasetOffThread,
  measure,
} from './fetch-dataset.ts';

function respondWith(body: string, init: ResponseInit = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status: 200, ...init }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDataset', () => {
  it('returns the parsed JSON and a report of the download', async () => {
    respondWith('{"hello":"world"}');
    const { json, report } = await fetchDataset('data/thing.json');
    expect(json).toEqual({ hello: 'world' });
    expect(report.path).toBe('data/thing.json');
    expect(report.url).toBe(`${import.meta.env.BASE_URL}data/thing.json`);
    expect(report.bytes).toBe(17);
    expect(report.downloadMs).toBeGreaterThanOrEqual(0);
    expect(report.parseMs).toBeGreaterThanOrEqual(0);
  });

  it('explains how to generate the datasets when the file is not there', async () => {
    respondWith('not found', { status: 404 });
    await expect(fetchDataset('data/missing.json')).rejects.toBeInstanceOf(DatasetUnavailableError);
    await expect(fetchDataset('data/missing.json')).rejects.toThrow(/HTTP 404/);
    await expect(fetchDataset('data/missing.json')).rejects.toThrow(/npm run data/);
  });

  it('reports a network failure rather than letting it through raw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );
    await expect(fetchDataset('data/x.json')).rejects.toThrow(/connection refused/);
  });

  it('reports a rejection that is not an Error', async () => {
    // Something that is not an Error: the loader has to describe it rather than crash on it.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new (class extends Object {})() as Error)),
    );
    await expect(fetchDataset('data/x.json')).rejects.toThrow(/network error/);
  });

  it('reports a body that is not JSON', async () => {
    respondWith('<html>a proxy error page</html>');
    await expect(fetchDataset('data/x.json')).rejects.toThrow(/not valid JSON/);
  });

  it('says when the bytes are in, before reading them, so the next download need not wait', async () => {
    respondWith('not json');
    const onDownloaded = vi.fn();
    // Called even though the body turns out unreadable: the reading comes after.
    await expect(fetchDataset('data/x.json', { onDownloaded })).rejects.toThrow();
    expect(onDownloaded).toHaveBeenCalledTimes(1);
  });

  it('keeps the path on the error, so a caller can say which file', async () => {
    respondWith('', { status: 500 });
    await expect(fetchDataset('data/named.json')).rejects.toMatchObject({
      name: 'DatasetUnavailableError',
      path: 'data/named.json',
    });
  });
});

describe('measure', () => {
  it('returns the value and how long it took', () => {
    const { value, ms } = measure(() => 6 * 7);
    expect(value).toBe(42);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('lets a failure through', () => {
    expect(() =>
      measure(() => {
        throw new Error('inner');
      }),
    ).toThrow('inner');
  });
});

describe('loadDataset', () => {
  /** A cache store that records what was deleted and what was put back. */
  function stubCaches(seed: string | null = '{"old":true}') {
    const store = new Map<string, Response>();
    if (seed !== null) {
      store.set(`${import.meta.env.BASE_URL}data/thing.json`, new Response(seed));
    }
    const log: string[] = [];
    vi.stubGlobal('caches', {
      keys: () => Promise.resolve(['bible-cross-references-data-v1', 'someone-elses-cache']),
      open: (name: string) =>
        Promise.resolve({
          match: (url: string) =>
            Promise.resolve(name.startsWith('bible-cross-references') ? store.get(url) : undefined),
          delete: (url: string) => {
            if (!name.startsWith('bible-cross-references') || !store.has(url)) {
              return Promise.resolve(false);
            }
            store.delete(url);
            log.push(`delete ${name}`);
            return Promise.resolve(true);
          },
          put: (url: string, response: Response) => {
            store.set(url, response);
            log.push(`put ${name}`);
            return Promise.resolve();
          },
        }),
    });
    return { log, store };
  }

  const unreadable = (json: unknown) => {
    if (!(typeof json === 'object' && json !== null && 'new' in json)) {
      throw new ValidationError('shape', 'this release needs the new shape');
    }
    return json;
  };

  it('returns the parsed value and the time spent on it', async () => {
    respondWith('{"n":1}');
    const { value, report } = await loadDataset('data/thing.json', (json) => json);
    expect(value).toEqual({ n: 1 });
    expect(report.processMs).toBeGreaterThanOrEqual(0);
  });

  it('drops a cached file this release cannot read, and reads the one it fetches instead', async () => {
    // The shape of a deployment: the offline cache still holds the previous release's file, and
    // the network has the new one. Without the retry this is a broken load for every reader who
    // has the app installed.
    const { log } = stubCaches();
    const bodies = ['{"old":true}', '{"new":true}'];
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(bodies.shift() ?? '{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { value } = await loadDataset('data/thing.json', unreadable);

    expect(value).toEqual({ new: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log).toEqual(['delete bible-cross-references-data-v1']);
  });

  it('puts the cached file back when the fresh one never arrives', async () => {
    // An offline reader whose cached copy this release cannot read. Deleting it and failing
    // would cost them the app on every later visit; this release cannot use the file, but it is
    // still theirs and a later release may read it.
    const { log, store } = stubCaches();
    const url = `${import.meta.env.BASE_URL}data/thing.json`;
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        return call === 1
          ? Promise.resolve(new Response('{"old":true}', { status: 200 }))
          : Promise.reject(new Error('offline'));
      }),
    );

    await expect(loadDataset('data/thing.json', unreadable)).rejects.toBeInstanceOf(
      DatasetUnavailableError,
    );
    expect(log).toEqual([
      'delete bible-cross-references-data-v1',
      'put bible-cross-references-data-v1',
    ]);
    expect(store.has(url)).toBe(true);
  });

  it("leaves caches that are not this app's alone", async () => {
    const { log } = stubCaches();
    const bodies = ['{"old":true}', '{"new":true}'];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(bodies.shift() ?? '{}', { status: 200 }))),
    );
    await loadDataset('data/thing.json', unreadable);
    expect(log.some((entry) => entry.includes('someone-elses-cache'))).toBe(false);
  });

  it("does not retry a failure that is not about the file's shape", async () => {
    // A bug while building the indices would meet the fresh copy the same way, so retrying only
    // downloads several megabytes twice on the way to the same error.
    stubCaches();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"n":1}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      loadDataset('data/thing.json', () => {
        throw new TypeError('a bug in the index builder');
      }),
    ).rejects.toThrow('a bug in the index builder');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up when the fetched file is wrong too, rather than looping', async () => {
    stubCaches();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"old":true}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadDataset('data/thing.json', unreadable)).rejects.toThrow(
      'this release needs the new shape',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a download that failed, which would only fail again', async () => {
    stubCaches();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadDataset('data/thing.json', (json) => json)).rejects.toBeInstanceOf(
      DatasetUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries where the cache cannot be reached at all', async () => {
    // Private browsing, or a browser with storage disabled: there is nothing to evict, and the
    // refetch has to happen anyway.
    vi.stubGlobal('caches', {
      keys: () => Promise.reject(new Error('storage is disabled')),
      open: () => Promise.reject(new Error('storage is disabled')),
    });
    const bodies = ['{"old":true}', '{"new":true}'];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(bodies.shift() ?? '{}', { status: 200 }))),
    );
    const { value } = await loadDataset('data/thing.json', unreadable);
    expect(value).toEqual({ new: true });
  });
});

describe('loadDatasetOffThread', () => {
  const VERSES = 10;
  const file = createCrossReferencesFile([{ from: 1, to: 4, votes: 2 }], VERSES);
  const request: DecodeRequest = {
    kind: 'cross-references',
    expected: { id: 'openbible', versification: 'kjv' },
    verseCount: VERSES,
  };
  const accept = (value: unknown) => acceptCrossReferenceTables(value, request.expected, VERSES);

  function serveFiles(...bodies: (string | Uint8Array<ArrayBuffer>)[]) {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(bodies.shift() ?? '', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  /** A worker in this thread, on a real message channel, running the dataset worker's code. */
  class InThreadWorker {
    static readonly started: string[] = [];
    readonly #port: MessagePort;

    constructor(url: URL) {
      InThreadWorker.started.push(url.href);
      const { port1, port2 } = new MessageChannel();
      serveRequests(port1, (message) => {
        const { request: asked, buffer } = parseDecodeMessage(message);
        return decodeDataset(asked, buffer);
      });
      port1.start();
      this.#port = port2;
    }

    addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') {
        this.#port.addEventListener('message', listener);
        this.#port.start();
      }
    }

    postMessage(message: unknown, transfer: Transferable[]): void {
      this.#port.postMessage(message, transfer);
    }
  }

  it('reads the file on this thread where there is no worker, and times both parts', async () => {
    serveFiles(encodeCrossReferences(file));
    const { value, report } = await loadDatasetOffThread('data/links.bin', request, accept);
    expect(Array.from(value.tables.targetStarts)).toEqual([4]);
    expect(report.parseMs).toBeGreaterThanOrEqual(0);
    expect(report.processMs).toBeGreaterThanOrEqual(0);
  });

  it('has the dataset worker read it where there is one', async () => {
    vi.stubGlobal('Worker', InThreadWorker);
    vi.resetModules();
    const fresh = await import('./fetch-dataset.ts');
    serveFiles(encodeCrossReferences(file));
    const { value } = await fresh.loadDatasetOffThread('data/links.bin', request, accept);
    expect(Array.from(value.tables.sources)).toEqual([1]);
    expect(InThreadWorker.started).toEqual([
      expect.stringContaining('core/datasets/dataset.worker.ts'),
    ]);
  });

  it('fetches again a cached copy an earlier release left, which this one cannot read', async () => {
    const fetchMock = serveFiles('{"format":"cross-references"}', encodeCrossReferences(file));
    const { value } = await loadDatasetOffThread('data/links.bin', request, accept);
    expect(value.metadata.sourceRowCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
