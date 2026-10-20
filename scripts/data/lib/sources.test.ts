import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { sha256Hex } from './files.ts';
import { findSource, pinnedDigest, type RawSource } from './sources.ts';
import type * as PathsModule from './paths.ts';

const VALID: RawSource = {
  id: 'bsb',
  description: 'Berean Standard Bible',
  url: 'https://example.org/bsb.txt',
  fileName: 'bsb.txt',
  sha256: 'a'.repeat(64),
  retrievedAt: '2026-01-02',
  license: 'Public domain',
  homepage: 'https://example.org/',
};

/** Points the module at a sources file of our own for the duration of a test. */
async function withSourcesFile(contents: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sources-test-'));
  const path = join(dir, 'sources.json');
  await writeFile(path, JSON.stringify(contents));
  vi.doMock('./paths.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof PathsModule>()),
    SOURCES_FILE: path,
  }));
  // The module reads the path at import time, so it has to be loaded again after the mock.
  vi.resetModules();
  return path;
}

afterEach(() => {
  vi.doUnmock('./paths.ts');
  vi.resetModules();
});

describe('readSources', () => {
  it('reads a well-formed file', async () => {
    await withSourcesFile({ sources: [VALID] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).resolves.toEqual([VALID]);
  });

  it('refuses a checksum that is not a SHA-256', async () => {
    await withSourcesFile({ sources: [{ ...VALID, sha256: 'nope' }] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/sources\[0\]\.sha256/);
  });

  it('refuses a date that is not a date', async () => {
    await withSourcesFile({ sources: [{ ...VALID, retrievedAt: '2 Jan 2026' }] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/does not match/);
  });

  it('refuses a file name that could escape the raw directory', async () => {
    await withSourcesFile({ sources: [{ ...VALID, fileName: '../escape.txt' }] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/does not match/);
  });

  it('refuses a missing field', async () => {
    const withoutHomepage: Record<string, unknown> = { ...VALID };
    delete withoutHomepage['homepage'];
    await withSourcesFile({ sources: [withoutHomepage] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/sources\[0\]\.homepage/);
  });

  it('refuses two sources with the same ID, which would make a pin ambiguous', async () => {
    await withSourcesFile({ sources: [VALID, { ...VALID, fileName: 'other.txt' }] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/must be unique/);
  });
});

describe('writeSources', () => {
  it('writes them back as formatted JSON, ending in a newline', async () => {
    const path = await withSourcesFile({ sources: [] });
    const { writeSources: write } = await import('./sources.ts');
    await write([VALID]);
    const written = await readFile(path, 'utf8');
    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written)).toEqual({ sources: [VALID] });
    expect(written).toContain('\n  ');
  });
});

describe('findSource', () => {
  it('finds one by its ID', () => {
    expect(findSource([VALID], 'bsb')).toBe(VALID);
  });

  it('says which ID is missing rather than returning nothing', () => {
    expect(() => findSource([VALID], 'kjv')).toThrow(/no source with ID "kjv"/);
  });
});

describe('pinning an entry inside an archive', () => {
  const text = strToU8('GEN 1:1 In the beginning.');
  const archive = (stamp: number): Uint8Array =>
    zipSync({ 'book.txt': [text, { mtime: stamp }] }, { mtime: stamp });
  const member = { ...VALID, member: 'book.txt', sha256: sha256Hex(text) };

  it('reads the digest of the entry, not of the archive around it', () => {
    expect(pinnedDigest(member, archive(1_700_000_000_000))).toBe(member.sha256);
  });

  it('ignores a rebuild that only moved the timestamps', () => {
    // Why this exists: eBible.org regenerates its archives, so the ZIP's bytes change while
    // every file inside stays identical. A pin on the archive then fails for no real reason.
    const monday = archive(1_700_000_000_000);
    const tuesday = archive(1_700_086_400_000);
    expect(Buffer.compare(Buffer.from(monday), Buffer.from(tuesday))).not.toBe(0);
    expect(pinnedDigest(member, monday)).toBe(pinnedDigest(member, tuesday));
  });

  it('still catches a change to the text itself', () => {
    const tampered = zipSync({ 'book.txt': strToU8('GEN 1:1 In the beginning, altered.') });
    expect(pinnedDigest(member, tampered)).not.toBe(member.sha256);
  });

  it('reads the whole file where no entry is named', () => {
    const bytes = strToU8('plain text, not an archive');
    expect(pinnedDigest(VALID, bytes)).toBe(sha256Hex(bytes));
  });

  it('says which entry is missing rather than returning nothing', () => {
    expect(() => pinnedDigest(member, zipSync({ 'other.txt': text }))).toThrow(
      /no entry named "book.txt"/,
    );
  });

  it('reads the script that makes an extracted file, and refuses anything else there', async () => {
    const extracted = { ...VALID, extractedBy: 'scripts/data/extract-thing.ts' };
    await withSourcesFile({ sources: [extracted] });
    await expect((await import('./sources.ts')).readSources()).resolves.toEqual([extracted]);
    await withSourcesFile({ sources: [{ ...VALID, extractedBy: 'rm -rf /' }] });
    await expect((await import('./sources.ts')).readSources()).rejects.toThrow(
      /sources\[0\]\.extractedBy/,
    );
  });

  it('refuses a member name that is not a plain file name', async () => {
    await withSourcesFile({ sources: [{ ...VALID, member: '../escape.txt' }] });
    const { readSources: read } = await import('./sources.ts');
    await expect(read()).rejects.toThrow(/sources\[0\]\.member/);
  });
});
