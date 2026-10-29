import { describe, expect, it } from 'vitest';
import { createCrossReferencesFile, type LinkSpec } from '../../test-utils/fixtures.ts';
import { ValidationError } from '../lib/validation.ts';
import {
  CROSS_REFERENCES_LAYOUT_VERSION,
  decodeCrossReferences,
  encodeCrossReferences,
} from './cross-references-binary.ts';
import type { CrossReferenceSourceId } from './ids.ts';
import type { ExpectedDataset } from './formats.ts';

const VERSES = 10;
const EXPECTED: ExpectedDataset<CrossReferenceSourceId> = {
  id: 'openbible',
  versification: 'kjv',
};

const LINKS: readonly LinkSpec[] = [
  { from: 0, to: 5, votes: 3 },
  { from: 0, to: 2, toEnd: 4, votes: 3 },
  { from: 0, to: 9, votes: 12 },
  { from: 2, to: 0, votes: -86 },
  { from: 7, to: 7, votes: 0 },
  { from: 9, to: 1, votes: 1293 },
];
const FILE = createCrossReferencesFile(LINKS, VERSES);

function decode(bytes: Uint8Array<ArrayBuffer>, verseCount = VERSES) {
  return decodeCrossReferences(bytes.buffer, EXPECTED, verseCount);
}

function columnsOf(links: {
  readonly offsets: ArrayLike<number>;
  readonly targetStart: ArrayLike<number>;
  readonly targetEnd: ArrayLike<number>;
  readonly votes: ArrayLike<number>;
}) {
  return {
    offsets: Array.from(links.offsets),
    targetStart: Array.from(links.targetStart),
    targetEnd: Array.from(links.targetEnd),
    votes: Array.from(links.votes),
  };
}

/** LEB128, as the file stores its numbers. */
function leb128(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

/**
 * A file laid out by hand, for the damage the encoder would never write: the header and metadata
 * as given, then whatever bytes follow.
 */
function handMade({
  verseCount = VERSES,
  linkCount,
  metadata = JSON.stringify({ ...FILE, links: undefined }),
  body,
}: {
  readonly verseCount?: number;
  readonly linkCount: number;
  readonly metadata?: string;
  readonly body: readonly number[];
}): Uint8Array<ArrayBuffer> {
  const description = new TextEncoder().encode(metadata);
  const bytes = new Uint8Array(24 + description.length + body.length);
  const header = new DataView(bytes.buffer);
  bytes.set([0x42, 0x58, 0x52, 0x46]);
  header.setUint16(4, CROSS_REFERENCES_LAYOUT_VERSION, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, verseCount, true);
  header.setUint32(16, linkCount, true);
  header.setUint32(20, description.length, true);
  bytes.set(description, 24);
  bytes.set(body, 24 + description.length);
  return bytes;
}

/** Each verse's link count, then the streams: distances, range lengths, votes (zigzag). */
function streams(
  counts: readonly number[],
  gaps: readonly number[],
  spans: readonly number[],
  votes: readonly number[],
): number[] {
  const padded = [...counts, ...new Array<number>(VERSES - counts.length).fill(0)];
  return [...padded, ...gaps, ...spans, ...votes].flatMap(leb128);
}

/** A copy with one 32-bit field of the header changed. */
function withHeader(at: number, value: number, bits: 16 | 32 = 32): Uint8Array<ArrayBuffer> {
  const bytes = encodeCrossReferences(FILE);
  const header = new DataView(bytes.buffer);
  if (bits === 16) {
    header.setUint16(at, value, true);
  } else {
    header.setUint32(at, value, true);
  }
  return bytes;
}

describe('the binary cross-reference file', () => {
  it('reads back exactly the links it was written from, in the dataset’s order', () => {
    const { metadata, links } = decode(encodeCrossReferences(FILE));
    expect(columnsOf(links)).toEqual(columnsOf(FILE.links));
    expect(metadata).toEqual({ ...FILE, links: undefined });
  });

  it('holds a whole Bible’s worth of links, ranges and votes of every size', () => {
    // A small generator rather than Math.random, so a failure can be reproduced.
    let seed = 7;
    const next = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const verseCount = 31102;
    const seen = new Set<string>();
    const links: LinkSpec[] = [];
    while (links.length < 20000) {
      const from = next(verseCount);
      const to = next(verseCount - 40);
      const toEnd = next(4) === 0 ? to + next(40) : to;
      if (!seen.has(`${String(from)}:${String(to)}:${String(toEnd)}`)) {
        seen.add(`${String(from)}:${String(to)}:${String(toEnd)}`);
        links.push({ from, to, toEnd, votes: next(2000) - 100 });
      }
    }
    const file = createCrossReferencesFile(links, verseCount);
    const { links: read } = decodeCrossReferences(
      encodeCrossReferences(file).buffer,
      EXPECTED,
      verseCount,
    );
    expect(columnsOf(read)).toEqual(columnsOf(file.links));
  });

  it('is the same bytes every time, so its hash, and its address, stay put', () => {
    expect(encodeCrossReferences(FILE)).toEqual(encodeCrossReferences(FILE));
  });

  it('says what it is in its first bytes, and how long it is', () => {
    const bytes = encodeCrossReferences(FILE);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('BXRF');
    expect(new DataView(bytes.buffer).getUint32(8, true)).toBe(bytes.length);
  });

  it('carries its credit in plain text, readable without the app', () => {
    const text = new TextDecoder().decode(encodeCrossReferences(FILE));
    expect(text).toContain('"provenance"');
    expect(text).toContain('"sourceId":"openbible"');
  });
});

describe('reading a cross-reference file refuses', () => {
  const refused = (bytes: Uint8Array<ArrayBuffer>, message: string, verseCount = VERSES) => {
    expect(() => decode(bytes, verseCount)).toThrow(ValidationError);
    expect(() => decode(bytes, verseCount)).toThrow(message);
  };

  it('an empty file', () => {
    refused(new Uint8Array(0), 'cross-references: the file is empty');
  });

  it('the JSON an earlier release served, by name', () => {
    refused(
      new TextEncoder().encode('{"format":"cross-references"}'),
      'expected the binary cross-reference format, got JSON',
    );
  });

  it('anything else', () => {
    refused(new Uint8Array([1, 2, 3, 4, 5]), 'got something else');
  });

  it('a file cut short inside its header', () => {
    refused(
      encodeCrossReferences(FILE).slice(0, 10),
      'the file is truncated: 10 bytes, short of its 24-byte header',
    );
  });

  it('a file cut short, saying how much arrived', () => {
    const bytes = encodeCrossReferences(FILE);
    refused(
      bytes.slice(0, bytes.length - 5),
      `the file is truncated: ${String(bytes.length - 5)} of its ${String(bytes.length)} bytes arrived`,
    );
  });

  it('bytes past its stated end', () => {
    const bytes = encodeCrossReferences(FILE);
    const longer = new Uint8Array(bytes.length + 3);
    longer.set(bytes);
    refused(longer, 'the file runs 3 bytes past its stated end');
  });

  it('a layout this release does not read, naming both versions', () => {
    refused(
      withHeader(4, CROSS_REFERENCES_LAYOUT_VERSION + 1, 16),
      `cross-references.version: the file is layout version ${String(CROSS_REFERENCES_LAYOUT_VERSION + 1)}, ` +
        `and this release reads version ${String(CROSS_REFERENCES_LAYOUT_VERSION)}`,
    );
  });

  it('a file for another number of verses', () => {
    refused(
      encodeCrossReferences(FILE),
      'cross-references.verseCount: expected 11 verses, the file has 10',
      11,
    );
  });

  it('metadata that runs past the end of the file', () => {
    refused(withHeader(20, 1_000_000), 'cross-references.metadata: runs past the end of the file');
  });

  it('metadata that is not JSON', () => {
    refused(
      handMade({ linkCount: 0, metadata: '{not json', body: streams([], [], [], []) }),
      'cross-references.metadata: is not valid JSON',
    );
  });

  it('the metadata of another source', () => {
    refused(
      handMade({
        linkCount: 0,
        metadata: JSON.stringify({ ...FILE, links: undefined, sourceId: 'elsewhere' }),
        body: streams([], [], [], []),
      }),
      'sourceId: expected one of "openbible", got "elsewhere"',
    );
  });

  it('verses holding more links than the file has', () => {
    refused(
      handMade({ linkCount: 1, body: streams([2], [3, 1], [0, 0], [0, 0]) }),
      'the verses hold more than its 1 links',
    );
  });

  it('verses holding fewer links than the file says', () => {
    refused(
      handMade({ linkCount: 3, body: streams([2], [3, 1], [0, 0], [0, 0]) }),
      'the verses hold 2 links, not the 3 it states',
    );
  });

  it('a link that points past the last verse', () => {
    refused(
      handMade({ linkCount: 1, body: streams([1], [VERSES], [0], [0]) }),
      'link 0 points past the last verse',
    );
  });

  it('a range that runs past the last verse', () => {
    refused(
      handMade({ linkCount: 1, body: streams([1], [VERSES - 2], [5], [0]) }),
      'link 0 points past the last verse',
    );
  });

  it('the same link twice in a verse', () => {
    refused(
      handMade({ linkCount: 2, body: streams([2], [3, 0], [0, 0], [2, 2]) }),
      'verse 0 has the same link twice',
    );
  });

  it('links that end before the file says they do', () => {
    refused(
      handMade({ linkCount: 2, body: streams([2], [3, 1], [0, 0], []) }),
      'the links end before the file says they do',
    );
  });

  it('a number longer than 32 bits', () => {
    refused(
      handMade({ linkCount: 0, body: [0xff, 0xff, 0xff, 0xff, 0xff, 0x01] }),
      'a number in the links is longer than 32 bits',
    );
  });

  it('bytes left over after the last link', () => {
    refused(
      handMade({ linkCount: 1, body: [...streams([1], [3], [0], [2]), 0] }),
      '1 bytes follow the last link',
    );
  });
});

describe('writing a cross-reference file refuses', () => {
  it('links out of the dataset’s order, which reading would quietly reorder', () => {
    expect(() =>
      encodeCrossReferences({
        ...FILE,
        links: { offsets: [0, 2, 2], targetStart: [1, 0], targetEnd: [1, 0], votes: [1, 5] },
      }),
    ).toThrow('the links of verse 0 are out of order');
  });

  it('a number the file cannot hold', () => {
    expect(() =>
      encodeCrossReferences({
        ...FILE,
        links: { offsets: [0, 1, 1], targetStart: [1], targetEnd: [0], votes: [0] },
      }),
    ).toThrow(RangeError);
  });
});
