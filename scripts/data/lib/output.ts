import { readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'fflate';
import {
  decodeCrossReferences,
  encodeCrossReferences,
} from '../../../src/core/datasets/cross-references-binary.ts';
import type {
  CrossReferencesFile,
  OriginalWordsFile,
  StudyNotesFile,
  TranslationTextFile,
} from '../../../src/core/datasets/formats.ts';
import { DATASET_HASH_LENGTH, datasetFileName } from '../../../src/core/datasets/paths.ts';
import { sha256Hex, writeFileAtomic } from './files.ts';
import { REPO_ROOT } from './paths.ts';

export type BuiltDataset =
  TranslationTextFile | CrossReferencesFile | OriginalWordsFile | StudyNotesFile;

/** A dataset ready to write: the file it goes in, relative to `public/data/`, and its bytes. */
export interface DatasetFile {
  readonly name: string;
  readonly file: string;
  readonly bytes: Uint8Array;
}

/** The module the app reads the files' names from; see `renderDatasetFiles`. */
export const DATASET_FILES_MODULE = resolve(REPO_ROOT, 'src/core/datasets/dataset-files.ts');

/**
 * Checks that the binary file reads back as the very links it was written from. Reading restores
 * the order of a verse's links by sorting, so a change to that order in the importer and not in
 * the reader would otherwise reach readers as quietly reordered links.
 */
function checkRoundTrip(dataset: CrossReferencesFile, bytes: Uint8Array): void {
  const layout = gunzipSync(bytes);
  const { links } = decodeCrossReferences(
    layout.buffer.slice(layout.byteOffset, layout.byteOffset + layout.byteLength),
    { id: dataset.sourceId, versification: dataset.versification },
    dataset.links.offsets.length - 1,
  );
  for (const column of ['offsets', 'targetStart', 'targetEnd', 'votes'] as const) {
    const written = dataset.links[column];
    const read = links[column];
    if (
      written.length !== read.length ||
      Array.from(written).some((value, index) => value !== read[index])
    ) {
      throw new Error(`Cross-references: the binary file reads back with different ${column}.`);
    }
  }
}

/**
 * The bytes a dataset is served as. The cross-references are binary (see
 * `cross-references-binary.ts`) and gzipped here: a server compresses JSON on its way out, but has
 * no reason to compress a file it knows only as bytes, and fflate's output is the same on every
 * machine, which keeps the file's hash — its URL — stable from one build to the next.
 */
export function serializeDataset(dataset: BuiltDataset): { bytes: Uint8Array; extension: string } {
  if (dataset.format === 'cross-references') {
    const bytes = gzipSync(encodeCrossReferences(dataset), { level: 9, mtime: 0 });
    checkRoundTrip(dataset, bytes);
    return { bytes, extension: 'bin' };
  }
  return { bytes: new TextEncoder().encode(JSON.stringify(dataset)), extension: 'json' };
}

/** The first digits of the SHA-256 of a file, which go in its name. */
export function datasetHash(bytes: Uint8Array): string {
  return sha256Hex(bytes).slice(0, DATASET_HASH_LENGTH);
}

export function prepareDataset(name: string, dataset: BuiltDataset): DatasetFile {
  const { bytes, extension } = serializeDataset(dataset);
  return { name, file: datasetFileName(name, datasetHash(bytes), extension), bytes };
}

async function filesUnder(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(directory, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
      );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Writes the datasets into `directory` and removes every other file there: an earlier build's
 * files have other names, and left in place they would be published beside the new ones.
 * Returns the files it removed.
 */
export async function writeDatasetFiles(
  files: readonly DatasetFile[],
  directory: string,
): Promise<string[]> {
  for (const { file, bytes } of files) {
    await writeFileAtomic(join(directory, file), bytes);
  }
  const current = new Set(files.map(({ file }) => file));
  const stale = (await filesUnder(directory)).filter((file) => !current.has(file)).toSorted();
  await Promise.all(stale.map((file) => rm(join(directory, file))));
  return stale;
}

/** The source of `DATASET_FILES_MODULE`: each dataset's file, by name, in a stable order. */
export function renderDatasetFiles(files: readonly DatasetFile[]): string {
  const entries = files
    .map(({ name, file }) => [name, file] as const)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, file]) => `  '${name}': '${file}',`);
  return [
    '/**',
    ' * The file each dataset is served from, by name, under `public/data/`. Written by',
    ' * `npm run data:build` from the files it has just built; do not edit it by hand.',
    ' *',
    ' * Committed, so that the app, the build plugins and the unit tests agree on every name',
    ' * without the data having been built. Every build writes it again before the app is compiled,',
    ' * so what ships always matches the files beside it; a change to the data shows up here as a',
    ' * new hash, and belongs in the same commit.',
    ' */',
    'export const DATASET_FILES: Readonly<Record<string, string>> = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}
