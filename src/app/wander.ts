import type { VerseIndex } from '../core/bible/verse-ref.ts';
import { elementAt } from '../core/lib/array.ts';
import type { CrossReferenceIndex } from '../cross-references/cross-reference-index.ts';
import { compileLinkFilter, type LinkFilter } from '../visualizations/shared/link-filter.ts';

/**
 * Wander: a jump to a richly linked verse the reader may not know.
 *
 * Richly linked means among the verses with the most links that pass the filter, so that wherever
 * it lands, every view has somewhere to go next. Those verses include the most famous ones, though
 * — Isaiah 41:10, John 3:16, Philippians 4:13 — and the point is a verse the reader may not know,
 * so the choice leans away from fame. Fame shows in the votes: readers vote on the links of the
 * verses they look up, and at the default filter the links of the best-known verses in the pool
 * average over a hundred votes each, where an obscure verse's average five or six.
 *
 * Everything here is pure and the randomness is passed in, so a seeded source makes it testable.
 */

/** The share of the verses with links that Wander chooses among: at the default filter, the 880
 * or so with 54 links or more. */
export const POOL_SHARE = 0.03;

/**
 * Never fewer verses to choose among than this while that many have links: a strict filter leaves
 * few verses with any, and the recent picks still have to be set aside.
 */
export const MIN_POOL = 30;

/** How many picks Wander remembers, so that it does not come back to them soon. */
export const RECENT_PICKS = 10;

/** The verses Wander chooses among, and how likely each one is. */
export interface WanderPool {
  /** Most linked first. */
  readonly verses: Int32Array;
  /** Each verse's weight, relative to the others'. */
  readonly weights: Float64Array;
}

/**
 * The pool under `filter`: the most linked verses, each weighted against its fame.
 *
 * A link counts for its source and for every verse of its target range, as in the incoming index,
 * and so do its votes; a link voted down adds nothing to its verses' fame. The weight is
 * 1 / √(1 + average votes per link). At the default filter that gives the tenth of the pool that
 * readers voted on most about one pick in eighteen rather than one in ten, and the least voted
 * tenth one in seven. A plain 1 / votes would all but hide the famous verses, and a reader may
 * well be glad to land on one now and then.
 */
export function wanderPool(
  index: CrossReferenceIndex,
  verseGenres: Uint8Array,
  filter: LinkFilter,
): WanderPool {
  const passes = compileLinkFilter(filter, verseGenres);
  const links = new Uint32Array(index.verseCount);
  const votes = new Float64Array(index.verseCount);
  const count = (verse: VerseIndex, credit: number) => {
    links[verse] = elementAt(links, verse) + 1;
    votes[verse] = elementAt(votes, verse) + credit;
  };
  for (let id = 0; id < index.linkCount; id += 1) {
    const from = elementAt(index.sources, id);
    const start = elementAt(index.targetStarts, id);
    const linkVotes = elementAt(index.votes, id);
    if (!passes(from, start, linkVotes)) {
      continue;
    }
    const credit = Math.max(linkVotes, 0);
    count(from, credit);
    const end = elementAt(index.targetEnds, id);
    for (let verse = start; verse <= end; verse += 1) {
      count(verse, credit);
    }
  }

  const linked: VerseIndex[] = [];
  for (let verse = 0; verse < index.verseCount; verse += 1) {
    if (elementAt(links, verse) > 0) {
      linked.push(verse);
    }
  }
  // Among equals, in Bible order: the same filter always gives the same pool.
  linked.sort((a, b) => elementAt(links, b) - elementAt(links, a) || a - b);
  const size = Math.min(linked.length, Math.max(MIN_POOL, Math.ceil(linked.length * POOL_SHARE)));
  const verses = Int32Array.from(linked.slice(0, size));
  const weights = Float64Array.from(
    verses,
    (verse) => 1 / Math.sqrt(1 + elementAt(votes, verse) / elementAt(links, verse)),
  );
  return { verses, weights };
}

/**
 * Picks a verse from the pool, with `random` returning numbers in [0, 1) as `Math.random` does.
 *
 * Never one that `isHere` says is on screen already, and none of the `recent` picks (oldest first)
 * while anything else is left: a pool too small for that lets the oldest of them back first.
 * `null` when the pool holds nothing but the passage on screen.
 */
export function pickWanderVerse(
  pool: WanderPool,
  isHere: (verse: VerseIndex) => boolean,
  recent: readonly VerseIndex[],
  random: () => number,
): VerseIndex | null {
  for (let kept = recent.length; kept >= 0; kept -= 1) {
    const avoided = new Set(recent.slice(recent.length - kept));
    const verse = draw(pool, (candidate) => isHere(candidate) || avoided.has(candidate), random);
    if (verse !== null) {
      return verse;
    }
  }
  return null;
}

/** One weighted draw among the verses `skip` leaves, or `null` when it leaves none. */
function draw(
  pool: WanderPool,
  skip: (verse: VerseIndex) => boolean,
  random: () => number,
): VerseIndex | null {
  let total = 0;
  for (let i = 0; i < pool.verses.length; i += 1) {
    if (!skip(elementAt(pool.verses, i))) {
      total += elementAt(pool.weights, i);
    }
  }
  if (total === 0) {
    return null;
  }
  let remaining = random() * total;
  let last: VerseIndex | null = null;
  for (let i = 0; i < pool.verses.length; i += 1) {
    const verse = elementAt(pool.verses, i);
    if (skip(verse)) {
      continue;
    }
    last = verse;
    remaining -= elementAt(pool.weights, i);
    if (remaining < 0) {
      return verse;
    }
  }
  // Rounding can leave a sliver past the last weight; it belongs to the last verse.
  return last;
}

/** The recent picks (oldest first) once `verse` is one of them, keeping the last few. */
export function rememberPick(
  recent: readonly VerseIndex[],
  verse: VerseIndex,
): readonly VerseIndex[] {
  return [...recent.filter((other) => other !== verse), verse].slice(-RECENT_PICKS);
}
