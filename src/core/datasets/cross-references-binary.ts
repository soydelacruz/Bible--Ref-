import { elementAt } from '../lib/array.ts';
import { ValidationError } from '../lib/validation.ts';
import {
  compareLinksInVerse,
  parseCrossReferencesMetadata,
  type CrossReferencesFile,
  type CrossReferencesMetadata,
  type ExpectedDataset,
} from './formats.ts';
import type { CrossReferenceSourceId } from './ids.ts';

/**
 * The cross-reference dataset's file: binary, because it is the largest download a first visit
 * makes and three numbers a link are most of it. Little-endian throughout:
 *
 *     0   4  "BXRF"
 *     4   2  layout version (`CROSS_REFERENCES_LAYOUT_VERSION`)
 *     6   2  zero
 *     8   4  length of the whole file, so a download cut short is told apart from a bad file
 *    12   4  verse count
 *    16   4  link count
 *    20   4  length of the metadata
 *    24      the metadata: the file's own description as UTF-8 JSON, everything but the links
 *            (provenance, notices, licence), so a copy still says whose data it is
 *     …      four streams of unsigned LEB128 numbers, one after another: the links of each
 *            source verse; then, for every link, its target's distance from the previous target
 *            of its verse (the first from verse 0); the length of its target range; its votes,
 *            zigzag-encoded
 *
 * Within a verse the links are stored by target, which keeps the distances small: that, more than
 * leaving JSON, is what halves the compressed size. The dataset's own order (`compareLinksInVerse`)
 * is a total order over the same links, so reading sorts them back, and the build checks the round
 * trip on every run.
 */
export const CROSS_REFERENCES_LAYOUT_VERSION = 1;

const MAGIC = [0x42, 0x58, 0x52, 0x46];
const HEADER_BYTES = 24;
const FILE = 'cross-references';

/** The links as typed arrays, ready to be handed between threads. */
export interface CrossReferenceArrays {
  readonly offsets: Int32Array<ArrayBuffer>;
  readonly targetStart: Int32Array<ArrayBuffer>;
  readonly targetEnd: Int32Array<ArrayBuffer>;
  readonly votes: Int32Array<ArrayBuffer>;
}

export interface DecodedCrossReferences {
  readonly metadata: CrossReferencesMetadata;
  readonly links: CrossReferenceArrays;
}

/** A growable buffer of LEB128 numbers. */
class NumberWriter {
  #bytes = new Uint8Array(1 << 16);
  #length = 0;

  get length(): number {
    return this.#length;
  }

  unsigned(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError(`Cross-references: ${String(value)} does not fit the file's numbers.`);
    }
    let rest = value;
    while (rest >= 0x80) {
      this.#push((rest & 0x7f) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.#push(rest);
  }

  signed(value: number): void {
    this.unsigned(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  writeTo(target: Uint8Array, at: number): void {
    target.set(this.#bytes.subarray(0, this.#length), at);
  }

  #push(byte: number): void {
    if (this.#length === this.#bytes.length) {
      const grown = new Uint8Array(this.#bytes.length * 2);
      grown.set(this.#bytes);
      this.#bytes = grown;
    }
    this.#bytes[this.#length] = byte;
    this.#length += 1;
  }
}

/** Writes a cross-reference dataset in the binary layout described above. */
export function encodeCrossReferences(file: CrossReferencesFile): Uint8Array<ArrayBuffer> {
  const { links, ...metadata } = file;
  const { offsets, targetStart, targetEnd, votes } = links;
  const verseCount = offsets.length - 1;
  const linkCount = targetStart.length;
  const link = (id: number) => ({
    targetStart: elementAt(targetStart, id),
    targetEnd: elementAt(targetEnd, id),
    votes: elementAt(votes, id),
  });

  const counts = new NumberWriter();
  const gaps = new NumberWriter();
  const spans = new NumberWriter();
  const tallies = new NumberWriter();
  for (let verse = 0; verse < verseCount; verse += 1) {
    const start = elementAt(offsets, verse);
    const end = elementAt(offsets, verse + 1);
    counts.unsigned(end - start);
    const ids: number[] = [];
    for (let id = start; id < end; id += 1) {
      // Reading restores this order by sorting, so anything else would come back changed.
      if (id > start && compareLinksInVerse(link(id - 1), link(id)) >= 0) {
        throw new Error(`Cross-references: the links of verse ${String(verse)} are out of order.`);
      }
      ids.push(id);
    }
    ids.sort((a, b) => link(a).targetStart - link(b).targetStart);
    let previous = 0;
    for (const id of ids) {
      const { targetStart: first, targetEnd: last, votes: count } = link(id);
      gaps.unsigned(first - previous);
      spans.unsigned(last - first);
      tallies.signed(count);
      previous = first;
    }
  }

  const description = new TextEncoder().encode(JSON.stringify(metadata));
  const streams = [counts, gaps, spans, tallies];
  const byteLength =
    HEADER_BYTES + description.length + streams.reduce((sum, stream) => sum + stream.length, 0);
  const bytes = new Uint8Array(byteLength);
  const header = new DataView(bytes.buffer);
  bytes.set(MAGIC, 0);
  header.setUint16(4, CROSS_REFERENCES_LAYOUT_VERSION, true);
  header.setUint32(8, byteLength, true);
  header.setUint32(12, verseCount, true);
  header.setUint32(16, linkCount, true);
  header.setUint32(20, description.length, true);
  bytes.set(description, HEADER_BYTES);
  let at = HEADER_BYTES + description.length;
  for (const stream of streams) {
    stream.writeTo(bytes, at);
    at += stream.length;
  }
  return bytes;
}

/** Reads LEB128 numbers from the streams, refusing to run past their end. */
class NumberReader {
  readonly #bytes: Uint8Array;
  #at: number;

  constructor(bytes: Uint8Array, at: number) {
    this.#bytes = bytes;
    this.#at = at;
  }

  get remaining(): number {
    return this.#bytes.length - this.#at;
  }

  unsigned(): number {
    let value = 0;
    let scale = 1;
    for (let size = 0; size < 5; size += 1) {
      if (this.#at >= this.#bytes.length) {
        throw new ValidationError(FILE, 'the links end before the file says they do');
      }
      const byte = this.#bytes[this.#at] ?? 0;
      this.#at += 1;
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) {
        return value;
      }
      scale *= 0x80;
    }
    throw new ValidationError(FILE, 'a number in the links is longer than 32 bits');
  }

  signed(): number {
    const zigzag = this.unsigned();
    return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
  }
}

function describeStart(bytes: Uint8Array): string {
  // An earlier release's JSON is the likeliest thing to find here, and worth naming as such.
  return bytes[0] === 0x7b ? 'JSON' : 'something else';
}

/**
 * Reads a cross-reference file, checking it on the way: what it is, which layout, that it arrived
 * whole, and that every link points inside the versification. Throws a `ValidationError` saying
 * what is wrong, which is what tells the loader to fetch a fresh copy.
 */
export function decodeCrossReferences(
  buffer: ArrayBuffer,
  expected: ExpectedDataset<CrossReferenceSourceId>,
  verseCount: number,
): DecodedCrossReferences {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new ValidationError(FILE, 'the file is empty');
  }
  if (MAGIC.some((byte, index) => index < bytes.length && bytes[index] !== byte)) {
    throw new ValidationError(
      FILE,
      `expected the binary cross-reference format, got ${describeStart(bytes)}`,
    );
  }
  if (bytes.length < HEADER_BYTES) {
    throw new ValidationError(
      FILE,
      `the file is truncated: ${String(bytes.length)} bytes, short of its ` +
        `${String(HEADER_BYTES)}-byte header`,
    );
  }
  const header = new DataView(buffer);
  const version = header.getUint16(4, true);
  if (version !== CROSS_REFERENCES_LAYOUT_VERSION) {
    throw new ValidationError(
      `${FILE}.version`,
      `the file is layout version ${String(version)}, and this release reads version ` +
        String(CROSS_REFERENCES_LAYOUT_VERSION),
    );
  }
  const byteLength = header.getUint32(8, true);
  if (bytes.length < byteLength) {
    throw new ValidationError(
      FILE,
      `the file is truncated: ${String(bytes.length)} of its ${String(byteLength)} bytes arrived`,
    );
  }
  if (bytes.length > byteLength) {
    throw new ValidationError(
      FILE,
      `the file runs ${String(bytes.length - byteLength)} bytes past its stated end`,
    );
  }
  const fileVerseCount = header.getUint32(12, true);
  if (fileVerseCount !== verseCount) {
    throw new ValidationError(
      `${FILE}.verseCount`,
      `expected ${String(verseCount)} verses, the file has ${String(fileVerseCount)}`,
    );
  }
  const linkCount = header.getUint32(16, true);
  const metadataEnd = HEADER_BYTES + header.getUint32(20, true);
  if (metadataEnd > byteLength) {
    throw new ValidationError(`${FILE}.metadata`, 'runs past the end of the file');
  }
  let description: unknown;
  try {
    description = JSON.parse(new TextDecoder().decode(bytes.subarray(HEADER_BYTES, metadataEnd)));
  } catch {
    throw new ValidationError(`${FILE}.metadata`, 'is not valid JSON');
  }
  const metadata = parseCrossReferencesMetadata(description, expected);

  const reader = new NumberReader(bytes, metadataEnd);
  const offsets = new Int32Array(verseCount + 1);
  let widest = 0;
  for (let verse = 0; verse < verseCount; verse += 1) {
    const count = reader.unsigned();
    widest = Math.max(widest, count);
    offsets[verse + 1] = elementAt(offsets, verse) + count;
    if (elementAt(offsets, verse + 1) > linkCount) {
      throw new ValidationError(FILE, `the verses hold more than its ${String(linkCount)} links`);
    }
  }
  if (offsets[verseCount] !== linkCount) {
    throw new ValidationError(
      FILE,
      `the verses hold ${String(offsets[verseCount])} links, not the ${String(linkCount)} it states`,
    );
  }

  // As stored: by target within each verse.
  const storedStart = new Int32Array(linkCount);
  const storedEnd = new Int32Array(linkCount);
  const storedVotes = new Int32Array(linkCount);
  for (let verse = 0; verse < verseCount; verse += 1) {
    let previous = 0;
    for (let id = elementAt(offsets, verse); id < elementAt(offsets, verse + 1); id += 1) {
      previous += reader.unsigned();
      if (previous >= verseCount) {
        throw new ValidationError(FILE, `link ${String(id)} points past the last verse`);
      }
      storedStart[id] = previous;
    }
  }
  for (let id = 0; id < linkCount; id += 1) {
    const last = elementAt(storedStart, id) + reader.unsigned();
    if (last >= verseCount) {
      throw new ValidationError(FILE, `link ${String(id)} points past the last verse`);
    }
    storedEnd[id] = last;
  }
  for (let id = 0; id < linkCount; id += 1) {
    storedVotes[id] = reader.signed();
  }
  if (reader.remaining > 0) {
    throw new ValidationError(FILE, `${String(reader.remaining)} bytes follow the last link`);
  }

  // Back into the dataset's order: `compareLinksInVerse`, on the stored columns.
  const targetStart = new Int32Array(linkCount);
  const targetEnd = new Int32Array(linkCount);
  const votes = new Int32Array(linkCount);
  const order = new Int32Array(widest);
  const compare = (a: number, b: number) =>
    elementAt(storedVotes, b) - elementAt(storedVotes, a) ||
    elementAt(storedStart, a) - elementAt(storedStart, b) ||
    elementAt(storedEnd, a) - elementAt(storedEnd, b);
  for (let verse = 0; verse < verseCount; verse += 1) {
    const start = elementAt(offsets, verse);
    const count = elementAt(offsets, verse + 1) - start;
    const ids = order.subarray(0, count);
    for (let index = 0; index < count; index += 1) {
      ids[index] = start + index;
    }
    ids.sort(compare);
    for (let index = 0; index < count; index += 1) {
      const id = elementAt(ids, index);
      if (index > 0 && compare(elementAt(ids, index - 1), id) === 0) {
        throw new ValidationError(FILE, `verse ${String(verse)} has the same link twice`);
      }
      targetStart[start + index] = elementAt(storedStart, id);
      targetEnd[start + index] = elementAt(storedEnd, id);
      votes[start + index] = elementAt(storedVotes, id);
    }
  }
  return { metadata, links: { offsets, targetStart, targetEnd, votes } };
}
