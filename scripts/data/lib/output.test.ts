import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'fflate';
import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import { decodeCrossReferences } from '../../../src/core/datasets/cross-references-binary.ts';
import {
  createCrossReferencesFile,
  createTranslationFile,
} from '../../../src/test-utils/fixtures.ts';
import {
  datasetHash,
  prepareDataset,
  renderDatasetFiles,
  serializeDataset,
  writeDatasetFiles,
} from './output.ts';
import { sha256Hex } from './files.ts';

const LINKS = createCrossReferencesFile(
  [
    { from: 0, to: 3, votes: 5 },
    { from: 2, to: 1, toEnd: 2, votes: -1 },
  ],
  5,
);

describe('serializing a dataset', () => {
  it('writes the cross-references as the binary file, gzipped, which reads back whole', () => {
    const { bytes, extension } = serializeDataset(LINKS);
    expect(extension).toBe('bin');
    const layout = gunzipSync(bytes);
    const { links } = decodeCrossReferences(
      layout.buffer.slice(layout.byteOffset, layout.byteOffset + layout.byteLength),
      { id: 'openbible', versification: 'kjv' },
      5,
    );
    expect(Array.from(links.targetStart)).toEqual([3, 1]);
  });

  it('writes everything else as JSON', () => {
    const file = createTranslationFile();
    const { bytes, extension } = serializeDataset(file);
    expect(extension).toBe('json');
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(file);
  });

  it('writes the same bytes every time, on any machine, so a name means one file', () => {
    expect(serializeDataset(LINKS).bytes).toEqual(serializeDataset(LINKS).bytes);
  });

  it('names a file after the start of its SHA-256', () => {
    const { name, file, bytes } = prepareDataset('cross-references/openbible', LINKS);
    expect(name).toBe('cross-references/openbible');
    expect(datasetHash(bytes)).toBe(sha256Hex(bytes).slice(0, 12));
    expect(file).toBe(`cross-references/openbible.${datasetHash(bytes)}.bin`);
  });
});

describe('writing the datasets', () => {
  it('writes each file and removes those an earlier build left beside them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'datasets-'));
    await mkdir(join(directory, 'translations'), { recursive: true });
    await writeFile(join(directory, 'translations', 'bsb.json'), '{}');
    await writeFile(join(directory, 'translations', 'bsb.000000000000.json'), '{}');
    const prepared = prepareDataset('translations/bsb', createTranslationFile());

    const removed = await writeDatasetFiles([prepared], directory);

    expect(removed).toEqual(['translations/bsb.000000000000.json', 'translations/bsb.json']);
    expect(await readdir(join(directory, 'translations'))).toEqual([
      prepared.file.replace('translations/', ''),
    ]);
    expect(await readFile(join(directory, prepared.file))).toEqual(Buffer.from(prepared.bytes));
  });

  it('starts from nothing on a fresh clone', async () => {
    const directory = join(await mkdtemp(join(tmpdir(), 'datasets-')), 'data');
    const prepared = prepareDataset('translations/bsb', createTranslationFile());
    expect(await writeDatasetFiles([prepared], directory)).toEqual([]);
  });
});

describe('the table of files', () => {
  const files = [
    prepareDataset('translations/bsb', createTranslationFile()),
    prepareDataset('cross-references/openbible', LINKS),
  ];

  it('lists every file by name, in an order that does not depend on the build’s', () => {
    const table = renderDatasetFiles(files);
    expect(table).toBe(renderDatasetFiles(files.toReversed()));
    expect(table.indexOf("'cross-references/openbible'")).toBeLessThan(
      table.indexOf("'translations/bsb'"),
    );
    expect(table).toContain(`'translations/bsb': '${files[0]?.file ?? ''}',`);
  });

  it('is written as Prettier would write it, so the format check passes on a fresh build', async () => {
    const table = renderDatasetFiles(files);
    expect(await format(table, { parser: 'typescript', singleQuote: true, printWidth: 100 })).toBe(
      table,
    );
  });
});
