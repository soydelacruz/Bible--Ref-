import type { VerseIndexRange } from '../../core/bible/versification.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { collectConnections } from '../shared/connections.ts';
import type { LinkFilter } from '../shared/link-filter.ts';
import type { ClusterLayout } from './cluster-layout.ts';
import type { Segments } from './clusters-drawing.ts';

/** The links that stand out, the dots at their ends, and the passage's own dots. */
export interface Highlight {
  readonly segments: Segments;
  readonly marked: readonly number[];
  readonly ringed: readonly number[];
}

export const NO_HIGHLIGHT: Highlight = {
  segments: { from: new Int32Array(0), to: new Int32Array(0), genre: new Uint8Array(0) },
  marked: [],
  ringed: [],
};

class SegmentBuilder {
  readonly #from: number[] = [];
  readonly #to: number[] = [];
  readonly #genre: number[] = [];
  readonly marked = new Set<number>();

  add(from: number, to: number, genre: number): void {
    this.#from.push(from);
    this.#to.push(to);
    this.#genre.push(genre);
    this.marked.add(from);
    this.marked.add(to);
  }

  build(ringed: readonly number[]): Highlight {
    return {
      segments: {
        from: Int32Array.from(this.#from),
        to: Int32Array.from(this.#to),
        genre: Uint8Array.from(this.#genre),
      },
      marked: [...this.marked],
      ringed,
    };
  }
}

/**
 * The links of a passage, growing out from it, each colored by the genre where it lands. Only
 * links that are drawn count (`drawn`, by link ID): with a book opened, a link elsewhere has no
 * place in the picture even if both its verses happen to have a dot.
 */
export function passageHighlight(
  layout: ClusterLayout,
  index: CrossReferenceIndex,
  drawn: Uint8Array,
  range: VerseIndexRange,
  filter: LinkFilter,
  verseGenres: Uint8Array,
): Highlight {
  const { outgoing, incoming } = collectConnections(index, range, filter, verseGenres);
  const builder = new SegmentBuilder();
  const seen = new Set<number>();
  for (const { link, direction, otherStart } of [...outgoing, ...incoming]) {
    if (seen.has(link.id) || elementAt(drawn, link.id) === 0) continue;
    seen.add(link.id);
    const source = elementAt(layout.nodeOf, link.from);
    const target = elementAt(layout.nodeOf, link.targetStart);
    const [here, there] = direction === 'outgoing' ? [source, target] : [target, source];
    builder.add(here, there, elementAt(verseGenres, otherStart));
  }
  const ringed: number[] = [];
  for (let verse = range.start; verse <= range.end; verse += 1) {
    const position = elementAt(layout.nodeOf, verse);
    if (position >= 0) ringed.push(position);
  }
  return builder.build(ringed);
}

/** Every drawn link that touches a cluster, growing out from it. */
export function groupHighlight(
  layout: ClusterLayout,
  index: CrossReferenceIndex,
  linkIds: Int32Array,
  group: number,
  verseGenres: Uint8Array,
): Highlight {
  const builder = new SegmentBuilder();
  for (const id of linkIds) {
    const fromVerse = elementAt(index.sources, id);
    const toVerse = elementAt(index.targetStarts, id);
    const from = elementAt(layout.nodeOf, fromVerse);
    const to = elementAt(layout.nodeOf, toVerse);
    if (elementAt(layout.nodeGroup, from) === group) {
      builder.add(from, to, elementAt(verseGenres, toVerse));
    } else if (elementAt(layout.nodeGroup, to) === group) {
      builder.add(to, from, elementAt(verseGenres, fromVerse));
    }
  }
  const members = layout.groups[group];
  if (members) {
    for (let position = members.first; position < members.first + members.count; position += 1) {
      builder.marked.add(position);
    }
  }
  return builder.build([]);
}

/** Flags, by link ID, of the links a graph draws. */
export function drawnLinks(linkCount: number, linkIds: Int32Array): Uint8Array {
  const drawn = new Uint8Array(linkCount);
  for (const id of linkIds) drawn[id] = 1;
  return drawn;
}
