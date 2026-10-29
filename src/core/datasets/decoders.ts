import {
  expectInteger,
  expectOneOf,
  expectRecord,
  ValidationError,
  type UnknownRecord,
} from '../lib/validation.ts';
import type { WorkerResult } from '../lib/worker-rpc.ts';
import { decodeCrossReferences } from './cross-references-binary.ts';
import {
  buildCrossReferenceTables,
  tableBuffers,
  type CrossReferenceTables,
} from './cross-reference-tables.ts';
import { BOOKS, type BookId } from '../bible/books.ts';
import {
  parseCrossReferencesMetadata,
  parseOriginalWordsFile,
  parseStudyNotesFile,
  parseTranslationTextFile,
  type CrossReferencesMetadata,
  type ExpectedDataset,
  type OriginalWordsFile,
  type StudyNotesFile,
  type TranslationTextFile,
} from './formats.ts';
import {
  CROSS_REFERENCE_SOURCE_IDS,
  NOTE_SOURCE_IDS,
  TRANSLATION_IDS,
  WORD_SOURCE_IDS,
  type CrossReferenceSourceId,
  type NoteSourceId,
  type TranslationId,
  type WordSourceId,
} from './ids.ts';

/**
 * Turning a downloaded file into what the app uses: the part of loading a dataset that keeps a
 * thread busy, and that the dataset worker (`dataset.worker.ts`) does off the main one. The same
 * functions run on the main thread where there is no worker.
 */

/** What to read a file as, and what it must turn out to be. */
export type DecodeRequest =
  | {
      readonly kind: 'cross-references';
      readonly expected: ExpectedDataset<CrossReferenceSourceId>;
      readonly verseCount: number;
    }
  | { readonly kind: 'translation'; readonly expected: ExpectedDataset<TranslationId> }
  | { readonly kind: 'original-words'; readonly expected: ExpectedDataset<WordSourceId> }
  | { readonly kind: 'study-notes'; readonly expected: ExpectedStudyNotes };

/** A book's notes from one source. */
export type ExpectedStudyNotes = ExpectedDataset<NoteSourceId> & { readonly book: BookId };

const BOOK_IDS: readonly BookId[] = BOOKS.map(({ id }) => id);

/** The cross-references, read and indexed: what they are, and the tables of their index. */
export interface CrossReferenceDatasetTables {
  readonly metadata: CrossReferencesMetadata;
  readonly tables: CrossReferenceTables;
}

const GZIP = [0x1f, 0x8b];

/** The bytes inside a gzipped file (as the cross-references are served), or the file itself. */
async function inflate(buffer: ArrayBuffer, file: string): Promise<ArrayBuffer> {
  const head = new Uint8Array(buffer, 0, Math.min(GZIP.length, buffer.byteLength));
  if (GZIP.some((byte, index) => head[index] !== byte)) {
    return buffer;
  }
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  // The writes fail along with the read below when the data is bad; that is where it is reported.
  writer.write(new Uint8Array(buffer)).catch(() => undefined);
  writer.close().catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    throw new ValidationError(file, 'the file is truncated or damaged: it does not decompress');
  }
  const inflated = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    inflated.set(chunk, at);
    at += chunk.length;
  }
  return inflated.buffer;
}

function parseJson(buffer: ArrayBuffer, file: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new ValidationError(file, 'the file is not valid JSON');
  }
}

export async function decodeCrossReferenceTables(
  buffer: ArrayBuffer,
  expected: ExpectedDataset<CrossReferenceSourceId>,
  verseCount: number,
): Promise<CrossReferenceDatasetTables> {
  const layout = await inflate(buffer, 'cross-references');
  const { metadata, links } = decodeCrossReferences(layout, expected, verseCount);
  return { metadata, tables: buildCrossReferenceTables(links, verseCount) };
}

export function decodeTranslationText(
  buffer: ArrayBuffer,
  expected: ExpectedDataset<TranslationId>,
): TranslationTextFile {
  return parseTranslationTextFile(parseJson(buffer, 'translation'), expected);
}

export function decodeOriginalWords(
  buffer: ArrayBuffer,
  expected: ExpectedDataset<WordSourceId>,
): OriginalWordsFile {
  return parseOriginalWordsFile(parseJson(buffer, 'original-words'), expected);
}

export function decodeStudyNotes(
  buffer: ArrayBuffer,
  expected: ExpectedStudyNotes,
): StudyNotesFile {
  return parseStudyNotesFile(parseJson(buffer, 'study-notes'), expected);
}

/** Does what `request` asks with `buffer`, on whichever thread this is. */
export async function decodeDataset(
  request: DecodeRequest,
  buffer: ArrayBuffer,
): Promise<WorkerResult> {
  switch (request.kind) {
    case 'cross-references': {
      const value = await decodeCrossReferenceTables(buffer, request.expected, request.verseCount);
      return { value, transfer: tableBuffers(value.tables) };
    }
    case 'translation':
      return { value: decodeTranslationText(buffer, request.expected), transfer: [] };
    case 'original-words':
      return { value: decodeOriginalWords(buffer, request.expected), transfer: [] };
    case 'study-notes':
      return { value: decodeStudyNotes(buffer, request.expected), transfer: [] };
  }
}

/** A request as it reaches the worker: checked, since a message could come from anywhere. */
export function parseDecodeMessage(message: unknown): {
  readonly request: DecodeRequest;
  readonly buffer: ArrayBuffer;
} {
  const record = expectRecord(message, 'request');
  const buffer = record['buffer'];
  if (!(buffer instanceof ArrayBuffer)) {
    throw new ValidationError('request.buffer', 'expected the bytes of a file');
  }
  const expected = expectRecord(record['expected'], 'request.expected');
  const versification = expectOneOf(expected['versification'], ['kjv'], 'request.versification');
  const kind = expectOneOf(
    record['kind'],
    ['cross-references', 'translation', 'original-words', 'study-notes'],
    'request.kind',
  );
  switch (kind) {
    case 'cross-references':
      return {
        buffer,
        request: {
          kind,
          expected: {
            id: expectOneOf(expected['id'], CROSS_REFERENCE_SOURCE_IDS, 'id'),
            versification,
          },
          verseCount: expectInteger(record['verseCount'], 'request.verseCount'),
        },
      };
    case 'translation':
      return {
        buffer,
        request: {
          kind,
          expected: { id: expectOneOf(expected['id'], TRANSLATION_IDS, 'id'), versification },
        },
      };
    case 'original-words':
      return {
        buffer,
        request: {
          kind,
          expected: { id: expectOneOf(expected['id'], WORD_SOURCE_IDS, 'id'), versification },
        },
      };
    case 'study-notes':
      return {
        buffer,
        request: {
          kind,
          expected: {
            id: expectOneOf(expected['id'], NOTE_SOURCE_IDS, 'id'),
            versification,
            book: expectOneOf(expected['book'], BOOK_IDS, 'book'),
          },
        },
      };
  }
}

function expectInt32Array(record: UnknownRecord, key: string): Int32Array {
  const value = record[key];
  if (!(value instanceof Int32Array)) {
    throw new ValidationError(`tables.${key}`, 'expected an Int32Array');
  }
  return value;
}

/**
 * Reads the worker's answer for the cross-references. Only the shape is checked here — the worker
 * has checked the file — so this costs nothing next to what the worker did.
 */
export function acceptCrossReferenceTables(
  value: unknown,
  expected: ExpectedDataset<CrossReferenceSourceId>,
  verseCount: number,
): CrossReferenceDatasetTables {
  const record = expectRecord(value, 'answer');
  const tables = expectRecord(record['tables'], 'tables');
  return {
    metadata: parseCrossReferencesMetadata(record['metadata'], expected),
    tables: {
      verseCount: expectOneOf(tables['verseCount'], [verseCount], 'tables.verseCount'),
      outgoingOffsets: expectInt32Array(tables, 'outgoingOffsets'),
      sources: expectInt32Array(tables, 'sources'),
      targetStarts: expectInt32Array(tables, 'targetStarts'),
      targetEnds: expectInt32Array(tables, 'targetEnds'),
      votes: expectInt32Array(tables, 'votes'),
      incomingOffsets: expectInt32Array(tables, 'incomingOffsets'),
      incomingLinkIds: expectInt32Array(tables, 'incomingLinkIds'),
    },
  };
}
