import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from './files.ts';
import type { RawSource } from './sources.ts';
import type * as DownloadModule from './download.ts';
import type * as PathsModule from './paths.ts';

const BODY = 'the file contents';
const DIGEST = sha256Hex(new TextEncoder().encode(BODY));

function source(overrides: Partial<RawSource> = {}): RawSource {
  return {
    id: 'thing',
    description: 'A thing',
    url: 'https://example.org/thing.txt',
    fileName: 'thing.txt',
    sha256: DIGEST,
    retrievedAt: '2026-01-01',
    license: 'Public domain',
    homepage: 'https://example.org/',
    ...overrides,
  };
}

/** Points the downloader at a directory of our own and loads it fresh. */
async function loadWithRawDir(): Promise<{
  dir: string;
  module: typeof DownloadModule;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'download-test-'));
  vi.doMock('./paths.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof PathsModule>()),
    RAW_DATA_DIR: dir,
    rawFilePath: (fileName: string) => join(dir, fileName),
  }));
  vi.resetModules();
  return { dir, module: await import('./download.ts') };
}

afterEach(() => {
  vi.doUnmock('./paths.ts');
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('download', () => {
  it('returns the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(BODY))),
    );
    const { module } = await loadWithRawDir();
    expect((await module.download('https://example.org/x')).toString()).toBe(BODY);
  });

  it('says which URL failed, and how', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    const { module } = await loadWithRawDir();
    await expect(module.download('https://example.org/missing')).rejects.toThrow(
      /GET https:\/\/example.org\/missing failed: HTTP 404/,
    );
  });
});

describe('downloadPinnedSource', () => {
  it('saves a file that matches its pin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(BODY))),
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { dir, module } = await loadWithRawDir();
    const content = await module.downloadPinnedSource(source());
    expect(content.toString()).toBe(BODY);
    expect(await readFile(join(dir, 'thing.txt'), 'utf8')).toBe(BODY);
  });

  it('refuses a file that does not, and says how to re-pin it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('something else'))),
    );
    const { dir, module } = await loadWithRawDir();
    await expect(module.downloadPinnedSource(source())).rejects.toThrow(
      /the upstream file changed/,
    );
    await expect(module.downloadPinnedSource(source())).rejects.toThrow(/data:fetch -- --update/);
    // Nothing unverified is left on disk.
    await expect(readFile(join(dir, 'thing.txt'), 'utf8')).rejects.toThrow();
  });

  it('never downloads a file the pipeline makes, and names the script that makes it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(BODY)));
    vi.stubGlobal('fetch', fetchMock);
    const { module } = await loadWithRawDir();
    await expect(
      module.downloadPinnedSource(source({ extractedBy: 'scripts/data/extract-thing.ts' })),
    ).rejects.toThrow(/not downloaded: make it with `node scripts\/data\/extract-thing.ts`/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never downloads a text the repository carries, and says how to get it back', async () => {
    // Upstream keeps revising it: a build that fell back to downloading would depend on the
    // latest revision again, which is what committing it is for.
    const fetchMock = vi.fn(() => Promise.resolve(new Response(BODY)));
    vi.stubGlobal('fetch', fetchMock);
    const { module } = await loadWithRawDir();
    const living = source({ member: 'thing.txt', unpacked: true });
    await expect(module.downloadPinnedSource(living)).rejects.toThrow(
      /thing.txt is missing.*`git checkout -- data\/raw\/thing.txt`.*`npm run data:fetch -- --update thing`/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
