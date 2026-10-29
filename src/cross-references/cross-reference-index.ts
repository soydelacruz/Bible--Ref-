import type { VerseIndex } from '../core/bible/verse-ref.ts';
import {
  buildCrossReferenceTables,
  CrossReferenceIntegrityError,
  type CrossReferenceTables,
} from '../core/datasets/cross-reference-tables.ts';
import type { CrossReferenceColumns } from '../core/datasets/formats.ts';
import { elementAt } from '../core/lib/array.ts';

export { CrossReferenceIntegrityError };

/** One cross-reference: from a verse to a verse or an inclusive range of verses. */
export interface CrossReferenceLink {
  /** Position of the link in its dataset. Stable for a given dataset file. */
  readonly id: number;
  readonly from: VerseIndex;
  readonly targetStart: VerseIndex;
  readonly targetEnd: VerseIndex;
  readonly votes: number;
}

function isTables(
  value: CrossReferenceColumns | CrossReferenceTables,
): value is CrossReferenceTables {
  return 'incomingLinkIds' in value;
}

/**
 * Cross-references indexed for O(1) lookup in both directions.
 *
 * Outgoing links come straight from the dataset's CSR layout. Incoming links are indexed under
 * every verse of a link's target range, so a link to Romans 1:19–20 is an incoming link of both
 * verses. The per-link columns are exposed read-only for bulk analytics.
 */
export class CrossReferenceIndex {
  readonly verseCount: number;
  readonly linkCount: number;
  /** Source verse of each link, by link ID. */
  readonly sources: ArrayLike<VerseIndex>;
  readonly targetStarts: ArrayLike<VerseIndex>;
  readonly targetEnds: ArrayLike<VerseIndex>;
  readonly votes: ArrayLike<number>;

  readonly #outgoingOffsets: Int32Array;
  readonly #incomingOffsets: Int32Array;
  readonly #incomingLinkIds: Int32Array;

  /**
   * From the dataset's columns, building the lookups here, or from tables already built (see
   * `buildCrossReferenceTables`), which costs nothing.
   */
  constructor(columns: CrossReferenceColumns | CrossReferenceTables, verseCount: number) {
    const tables = isTables(columns) ? columns : buildCrossReferenceTables(columns, verseCount);
    if (tables.verseCount !== verseCount) {
      throw new CrossReferenceIntegrityError(
        `the tables are for ${tables.verseCount} verses, not ${verseCount}.`,
      );
    }
    this.verseCount = verseCount;
    this.linkCount = tables.targetStarts.length;
    this.sources = tables.sources;
    this.targetStarts = tables.targetStarts;
    this.targetEnds = tables.targetEnds;
    this.votes = tables.votes;
    this.#outgoingOffsets = tables.outgoingOffsets;
    this.#incomingOffsets = tables.incomingOffsets;
    this.#incomingLinkIds = tables.incomingLinkIds;
  }

  link(id: number): CrossReferenceLink {
    return {
      id,
      from: elementAt(this.sources, id),
      targetStart: this.#targetStart(id),
      targetEnd: this.#targetEnd(id),
      votes: elementAt(this.votes, id),
    };
  }

  /** Links from `verse`, in dataset order. */
  outgoing(verse: VerseIndex): CrossReferenceLink[] {
    const links: CrossReferenceLink[] = [];
    for (let id = this.#outgoingStart(verse); id < this.#outgoingEnd(verse); id += 1) {
      links.push(this.link(id));
    }
    return links;
  }

  /** Links whose target range contains `verse`, in dataset order. */
  incoming(verse: VerseIndex): CrossReferenceLink[] {
    const start = elementAt(this.#incomingOffsets, verse);
    const end = elementAt(this.#incomingOffsets, verse + 1);
    return Array.from(this.#incomingLinkIds.subarray(start, end), (id) => this.link(id));
  }

  outgoingCount(verse: VerseIndex): number {
    return this.#outgoingEnd(verse) - this.#outgoingStart(verse);
  }

  incomingCount(verse: VerseIndex): number {
    return elementAt(this.#incomingOffsets, verse + 1) - elementAt(this.#incomingOffsets, verse);
  }

  #outgoingStart(verse: VerseIndex): number {
    return elementAt(this.#outgoingOffsets, verse);
  }

  #outgoingEnd(verse: VerseIndex): number {
    return elementAt(this.#outgoingOffsets, verse + 1);
  }

  #targetStart(id: number): VerseIndex {
    return elementAt(this.targetStarts, id);
  }

  #targetEnd(id: number): VerseIndex {
    return elementAt(this.targetEnds, id);
  }
}
