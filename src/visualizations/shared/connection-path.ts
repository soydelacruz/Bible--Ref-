import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import type { VerseIndexRange } from '../../core/bible/versification.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import type { LinkDirection } from './connections.ts';
import { compileLinkFilter, type LinkFilter } from './link-filter.ts';

/** The link that leads to a step of a path from the step before it. */
export interface PathHop {
  readonly linkId: number;
  readonly votes: number;
  /**
   * `outgoing`: the previous step references this one. `incoming`: this one references the
   * previous step. A path may use a link either way, since either way the two passages are joined.
   */
  readonly direction: LinkDirection;
}

export interface PathStep {
  readonly verse: VerseIndex;
  /** How this step is reached; `null` for the first one. */
  readonly hop: PathHop | null;
}

const UNSEEN = -1;

/**
 * The shortest chain of cross-references from any verse of `from` to any verse of `to`, through
 * the links the filter shows, or `null` when none joins them.
 *
 * Fewest links first, because that is what makes a chain readable; among chains of the same
 * length, the one whose links readers voted for most, so the path is the best supported rather
 * than the first one found. Breadth-first, a level at a time: a verse's best score is final
 * before anything one link further on is scored from it, which is what makes the second choice
 * exact rather than greedy.
 */
export function findConnectionPath(
  index: CrossReferenceIndex,
  from: VerseIndexRange,
  to: VerseIndexRange,
  filter: LinkFilter,
  verseGenres: Uint8Array,
): PathStep[] | null {
  const isDestination = (verse: VerseIndex) => verse >= to.start && verse <= to.end;
  for (let verse = from.start; verse <= from.end; verse += 1) {
    if (isDestination(verse)) {
      return [{ verse, hop: null }];
    }
  }

  const passes = compileLinkFilter(filter, verseGenres);
  const distance = new Int32Array(index.verseCount).fill(UNSEEN);
  const score = new Float64Array(index.verseCount);
  const previous = new Int32Array(index.verseCount).fill(UNSEEN);
  const hops = new Map<VerseIndex, PathHop>();

  let level: VerseIndex[] = [];
  for (let verse = from.start; verse <= from.end; verse += 1) {
    distance[verse] = 0;
    level.push(verse);
  }

  while (level.length > 0) {
    const next: VerseIndex[] = [];
    const reach = (here: VerseIndex, there: VerseIndex, hop: PathHop) => {
      const total = elementAt(score, here) + hop.votes;
      const seen = elementAt(distance, there);
      if (seen === UNSEEN) {
        distance[there] = elementAt(distance, here) + 1;
        next.push(there);
      } else if (seen !== elementAt(distance, here) + 1 || total <= elementAt(score, there)) {
        return;
      }
      score[there] = total;
      previous[there] = here;
      hops.set(there, hop);
    };
    for (const here of level) {
      for (const link of index.outgoing(here)) {
        if (passes(link.from, link.targetStart, link.votes)) {
          const hop = { linkId: link.id, votes: link.votes, direction: 'outgoing' } as const;
          for (let there = link.targetStart; there <= link.targetEnd; there += 1) {
            reach(here, there, hop);
          }
        }
      }
      for (const link of index.incoming(here)) {
        if (passes(link.from, link.targetStart, link.votes)) {
          reach(here, link.from, { linkId: link.id, votes: link.votes, direction: 'incoming' });
        }
      }
    }

    let arrival: VerseIndex | null = null;
    for (const verse of next) {
      if (
        isDestination(verse) &&
        (arrival === null || elementAt(score, verse) > elementAt(score, arrival))
      ) {
        arrival = verse;
      }
    }
    if (arrival !== null) {
      return traceBack(arrival, previous, hops);
    }
    level = next;
  }
  return null;
}

function traceBack(
  arrival: VerseIndex,
  previous: Int32Array,
  hops: ReadonlyMap<VerseIndex, PathHop>,
): PathStep[] {
  const steps: PathStep[] = [];
  for (let verse = arrival; verse !== UNSEEN; verse = elementAt(previous, verse)) {
    steps.push({ verse, hop: hops.get(verse) ?? null });
  }
  return steps.reverse();
}
