import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createCrossReferencesFile,
  createTranslationFile,
  PROVENANCE,
} from '../../test-utils/fixtures.ts';
import { CANONICAL_VERSIFICATION } from '../bible/versification.ts';
import { ValidationError } from '../lib/validation.ts';
import { encodeCrossReferences } from './cross-references-binary.ts';
import {
  acceptCrossReferenceTables,
  decodeCrossReferenceTables,
  decodeDataset,
  decodeOriginalWords,
  decodeTranslationText,
  parseDecodeMessage,
  type DecodeRequest,
} from './decoders.ts';

const VERSES = 10;
const LINKS = createCrossReferencesFile(
  [
    { from: 0, to: 3, votes: 5 },
    { from: 0, to: 1, toEnd: 3, votes: 2 },
    { from: 2, to: 0, votes: -1 },
  ],
  VERSES,
);
const LINKS_REQUEST: DecodeRequest = {
  kind: 'cross-references',
  expected: { id: 'openbible', versification: 'kjv' },
  verseCount: VERSES,
};

const WORDS = {
  format: 'original-words',
  schemaVersion: 1,
  versification: 'kjv',
  provenance: PROVENANCE,
  notices: [],
  sourceId: 'stepbible',
  license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  attribution: 'STEP Bible',
  maxVerses: 100,
  words: {
    strongs: ['H7225G'],
    lemma: ['רֵאשִׁית'],
    transliteration: ['reshit'],
    gloss: ['beginning'],
    offsets: [0, 1],
    verses: [0],
  },
};

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;
const linksFile = () => encodeCrossReferences(LINKS).buffer;
const gzipped = () => {
  const bytes = gzipSync(encodeCrossReferences(LINKS));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('reading the cross-references', () => {
  it('builds the index’s tables from the file as served, gzipped', async () => {
    const { metadata, tables } = await decodeCrossReferenceTables(
      gzipped(),
      LINKS_REQUEST.expected,
      VERSES,
    );
    expect(metadata.sourceRowCount).toBe(3);
    expect(Array.from(tables.sources)).toEqual([0, 0, 2]);
    expect(Array.from(tables.targetStarts)).toEqual([3, 1, 0]);
    // Link 1 runs over verses 1–3, so it is an incoming link of each.
    expect(Array.from(tables.incomingOffsets)).toEqual([0, 1, 2, 3, 5, 5, 5, 5, 5, 5, 5]);
  });

  it('reads the same file unwrapped, should something on the way have unzipped it', async () => {
    const plain = await decodeCrossReferenceTables(linksFile(), LINKS_REQUEST.expected, VERSES);
    const zipped = await decodeCrossReferenceTables(gzipped(), LINKS_REQUEST.expected, VERSES);
    expect(plain).toEqual(zipped);
  });

  it('says a file cut short in transit is damaged, not something else', async () => {
    const whole = new Uint8Array(gzipped());
    const cut = whole.slice(0, Math.floor(whole.length / 2)).buffer;
    await expect(decodeCrossReferenceTables(cut, LINKS_REQUEST.expected, VERSES)).rejects.toThrow(
      new ValidationError(
        'cross-references',
        'the file is truncated or damaged: it does not decompress',
      ),
    );
  });
});

describe('reading a translation and the words', () => {
  it('parses and checks a translation', () => {
    const file = createTranslationFile();
    expect(
      decodeTranslationText(json(file), { id: 'bsb', versification: 'kjv' }).verses,
    ).toHaveLength(CANONICAL_VERSIFICATION.verseCount);
  });

  it('refuses a file that is not JSON as a file to fetch again', () => {
    expect(() =>
      decodeTranslationText(new TextEncoder().encode('{"cut off').buffer, {
        id: 'bsb',
        versification: 'kjv',
      }),
    ).toThrow(new ValidationError('translation', 'the file is not valid JSON'));
  });

  it('parses and checks the words', () => {
    expect(
      decodeOriginalWords(json(WORDS), { id: 'stepbible', versification: 'kjv' }).words.strongs,
    ).toEqual(['H7225G']);
  });
});

describe('decodeDataset', () => {
  it('hands back every table of the links’ index without copying it', async () => {
    const { value, transfer } = await decodeDataset(LINKS_REQUEST, linksFile());
    expect(transfer).toHaveLength(7);
    expect(
      acceptCrossReferenceTables(value, LINKS_REQUEST.expected, VERSES).tables.verseCount,
    ).toBe(VERSES);
  });

  it('reads a translation, and the words, with nothing to hand over', async () => {
    const text = await decodeDataset(
      { kind: 'translation', expected: { id: 'bsb', versification: 'kjv' } },
      json(createTranslationFile()),
    );
    expect(text.transfer).toEqual([]);
    const words = await decodeDataset(
      { kind: 'original-words', expected: { id: 'stepbible', versification: 'kjv' } },
      json(WORDS),
    );
    expect(words.transfer).toEqual([]);
  });
});

describe('a request as the worker receives it', () => {
  it('is read back as it was sent', () => {
    const buffer = new ArrayBuffer(4);
    expect(parseDecodeMessage({ ...LINKS_REQUEST, buffer })).toEqual({
      request: LINKS_REQUEST,
      buffer,
    });
    for (const request of [
      { kind: 'translation', expected: { id: 'kjv', versification: 'kjv' } },
      { kind: 'original-words', expected: { id: 'stepbible', versification: 'kjv' } },
    ] as const) {
      expect(parseDecodeMessage({ ...request, buffer })).toEqual({ request, buffer });
    }
  });

  it('is refused without its bytes, or asking for something unknown', () => {
    expect(() => parseDecodeMessage({ ...LINKS_REQUEST })).toThrow('request.buffer');
    expect(() =>
      parseDecodeMessage({ ...LINKS_REQUEST, kind: 'maps', buffer: new ArrayBuffer(0) }),
    ).toThrow('request.kind');
    expect(() =>
      parseDecodeMessage({
        kind: 'translation',
        expected: { id: 'klingon', versification: 'kjv' },
        buffer: new ArrayBuffer(0),
      }),
    ).toThrow('id: expected one of');
  });
});

describe('accepting the worker’s tables', () => {
  it('refuses tables that are not typed arrays, or for another number of verses', async () => {
    const { value } = await decodeDataset(LINKS_REQUEST, linksFile());
    const answer = acceptCrossReferenceTables(value, LINKS_REQUEST.expected, VERSES);
    expect(() =>
      acceptCrossReferenceTables(
        { ...answer, tables: { ...answer.tables, sources: [0, 0, 2] } },
        LINKS_REQUEST.expected,
        VERSES,
      ),
    ).toThrow('tables.sources: expected an Int32Array');
    expect(() => acceptCrossReferenceTables(value, LINKS_REQUEST.expected, VERSES + 1)).toThrow(
      'tables.verseCount',
    );
  });
});
