import { elementAt } from '../lib/array.ts';
import type { CrossReferenceColumns } from './formats.ts';

export class CrossReferenceIntegrityError extends Error {
  constructor(message: string) {
    super(`Invalid cross-reference data: ${message}`);
    this.name = 'CrossReferenceIntegrityError';
  }
}

/**
 * Everything the index is made of, as typed arrays: the links' columns and the lookups built from
 * them. Built by `buildCrossReferenceTables`, which is the expensive part and can run off the main
 * thread; the arrays' buffers can then be handed over rather than copied.
 */
export interface CrossReferenceTables {
  readonly verseCount: number;
  /** CSR offsets of each source verse's links. */
  readonly outgoingOffsets: Int32Array;
  readonly sources: Int32Array;
  readonly targetStarts: Int32Array;
  readonly targetEnds: Int32Array;
  readonly votes: Int32Array;
  /** CSR offsets into `incomingLinkIds`, by target verse. */
  readonly incomingOffsets: Int32Array;
  readonly incomingLinkIds: Int32Array;
}

/** Validates the columns and builds the lookups of a `CrossReferenceIndex`. */
export function buildCrossReferenceTables(
  columns: CrossReferenceColumns,
  verseCount: number,
): CrossReferenceTables {
  const linkCount = columns.targetStart.length;
  validateColumns(columns, verseCount, linkCount);
  const outgoingOffsets = Int32Array.from(columns.offsets);
  const targetStarts = Int32Array.from(columns.targetStart);
  const targetEnds = Int32Array.from(columns.targetEnd);

  const sources = new Int32Array(linkCount);
  for (let verse = 0; verse < verseCount; verse += 1) {
    sources.fill(verse, elementAt(outgoingOffsets, verse), elementAt(outgoingOffsets, verse + 1));
  }

  // Incoming index: counting sort of (target verse, link ID) pairs over the expanded ranges.
  const incomingOffsets = new Int32Array(verseCount + 1);
  for (let id = 0; id < linkCount; id += 1) {
    for (let verse = elementAt(targetStarts, id); verse <= elementAt(targetEnds, id); verse += 1) {
      incomingOffsets[verse + 1] = elementAt(incomingOffsets, verse + 1) + 1;
    }
  }
  for (let verse = 0; verse < verseCount; verse += 1) {
    incomingOffsets[verse + 1] =
      elementAt(incomingOffsets, verse + 1) + elementAt(incomingOffsets, verse);
  }
  const cursors = incomingOffsets.slice(0, verseCount);
  const incomingLinkIds = new Int32Array(elementAt(incomingOffsets, verseCount));
  for (let id = 0; id < linkCount; id += 1) {
    for (let verse = elementAt(targetStarts, id); verse <= elementAt(targetEnds, id); verse += 1) {
      const cursor = elementAt(cursors, verse);
      incomingLinkIds[cursor] = id;
      cursors[verse] = cursor + 1;
    }
  }
  return {
    verseCount,
    outgoingOffsets,
    sources,
    targetStarts,
    targetEnds,
    votes: Int32Array.from(columns.votes),
    incomingOffsets,
    incomingLinkIds,
  };
}

/** Every typed array of the tables, for handing them between threads. */
export function tableBuffers(tables: CrossReferenceTables): ArrayBuffer[] {
  return [
    tables.outgoingOffsets,
    tables.sources,
    tables.targetStarts,
    tables.targetEnds,
    tables.votes,
    tables.incomingOffsets,
    tables.incomingLinkIds,
  ].flatMap(({ buffer }) => (buffer instanceof ArrayBuffer ? [buffer] : []));
}

function validateColumns(columns: CrossReferenceColumns, verseCount: number, linkCount: number) {
  const { offsets, targetStart, targetEnd, votes } = columns;
  if (offsets.length !== verseCount + 1) {
    throw new CrossReferenceIntegrityError(
      `expected ${verseCount + 1} offsets, got ${offsets.length}.`,
    );
  }
  if (targetEnd.length !== linkCount || votes.length !== linkCount) {
    throw new CrossReferenceIntegrityError('link columns have different lengths.');
  }
  if (offsets[0] !== 0 || offsets[verseCount] !== linkCount) {
    throw new CrossReferenceIntegrityError(`offsets must span links 0 to ${linkCount}.`);
  }
  for (let verse = 0; verse < verseCount; verse += 1) {
    if (elementAt(offsets, verse) > elementAt(offsets, verse + 1)) {
      throw new CrossReferenceIntegrityError(`offsets decrease at verse ${verse}.`);
    }
  }
  for (let id = 0; id < linkCount; id += 1) {
    const start = elementAt(targetStart, id);
    const end = elementAt(targetEnd, id);
    if (start < 0 || end >= verseCount || start > end) {
      throw new CrossReferenceIntegrityError(`link ${id} has an invalid target range.`);
    }
  }
}
