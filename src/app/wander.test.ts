import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { seededRandom } from '../core/lib/random.ts';
import { CrossReferenceIndex } from '../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../test-utils/fixtures.ts';
import { createLinkFilter } from '../visualizations/shared/link-filter.ts';
import { computeVerseGenres } from '../visualizations/shared/verse-genres.ts';
import {
  MIN_POOL,
  pickWanderVerse,
  POOL_SHARE,
  RECENT_PICKS,
  rememberPick,
  wanderPool,
  type WanderPool,
} from './wander.ts';

const verseGenres = computeVerseGenres(CANONICAL_VERSIFICATION);
const EVERY_LINK = createLinkFilter(-Infinity);
const NOWHERE = () => false;

interface Link {
  readonly from: number;
  readonly to: number;
  readonly toEnd?: number;
  readonly votes?: number;
}

function indexOf(links: readonly Link[]): CrossReferenceIndex {
  return new CrossReferenceIndex(
    createCrossReferenceColumns(links),
    CANONICAL_VERSIFICATION.verseCount,
  );
}

/**
 * `count` verses from `first` on, each with `links` links to verses of its own from `targets` on:
 * the hubs have `links` links each, their targets one.
 */
function hubs(first: number, count: number, links: number, targets: number, votes = 4): Link[] {
  return Array.from({ length: count * links }, (_, i) => ({
    from: first + Math.floor(i / links),
    to: targets + i,
    votes,
  }));
}

/** `count` links from verses of their own to verses of their own: one link each. */
function pairs(count: number, from: number, to: number): Link[] {
  return Array.from({ length: count }, (_, i) => ({ from: from + i, to: to + i, votes: 4 }));
}

/** A pool of the given verses, all as likely as each other. */
function poolOf(...verses: number[]): WanderPool {
  return { verses: Int32Array.from(verses), weights: new Float64Array(verses.length).fill(1) };
}

describe('wanderPool', () => {
  const GEN = verseIndex('Gen', 1, 1);
  const PS = verseIndex('Ps', 23, 1);
  const JOHN = verseIndex('John', 1, 1);
  const index = indexOf([
    { from: GEN, to: JOHN, votes: 12 },
    { from: GEN, to: PS, votes: -3 },
    { from: PS, to: JOHN, toEnd: JOHN + 2, votes: 4 },
  ]);

  it('counts the links of a verse both ways, a range for each of its verses', () => {
    const pool = wanderPool(index, verseGenres, EVERY_LINK);
    // Two links each for Genesis, the psalm and John 1:1; one for John 1:2 and 1:3, in the range.
    expect(Array.from(pool.verses)).toEqual([GEN, PS, JOHN, JOHN + 1, JOHN + 2]);
  });

  it('counts only the links that pass the filter', () => {
    expect(Array.from(wanderPool(index, verseGenres, createLinkFilter(0)).verses)).toEqual([
      JOHN,
      GEN,
      PS,
      JOHN + 1,
      JOHN + 2,
    ]);
    const noPoetry = { minVotes: -Infinity, hiddenGenres: new Set(['poetry'] as const) };
    expect(Array.from(wanderPool(index, verseGenres, noPoetry).verses)).toEqual([GEN, JOHN]);
  });

  it('chooses among the top few percent of the verses with links', () => {
    // 80 verses with three links each, among 2,320 verses with links.
    const links = [...hubs(1000, 80, 3, 5000), ...pairs(1000, 10_000, 20_000)];
    const pool = wanderPool(indexOf(links), verseGenres, EVERY_LINK);
    const size = Math.ceil(2320 * POOL_SHARE);
    expect(size).toBeGreaterThan(MIN_POOL);
    expect(pool.verses).toHaveLength(size);
    expect(Array.from(pool.verses).every((verse) => verse >= 1000 && verse < 1080)).toBe(true);
  });

  it('keeps a few to choose among where few verses stand out', () => {
    const links = [...hubs(1000, 5, 3, 5000), ...pairs(100, 10_000, 20_000)];
    const pool = wanderPool(indexOf(links), verseGenres, EVERY_LINK);
    expect(pool.verses).toHaveLength(MIN_POOL);
    expect(Array.from(pool.verses.subarray(0, 5))).toEqual([1000, 1001, 1002, 1003, 1004]);
  });

  it('weighs a verse against the votes on its links, without counting votes against', () => {
    const famous = verseIndex('Gen', 1, 1);
    const obscure = verseIndex('Gen', 1, 2);
    const disputed = verseIndex('Gen', 1, 3);
    const pool = wanderPool(
      indexOf([
        ...hubs(famous, 1, 4, 5000, 100),
        ...hubs(obscure, 1, 4, 6000, 1),
        { from: disputed, to: 7000, votes: -50 },
      ]),
      verseGenres,
      EVERY_LINK,
    );
    const weightOf = (verse: number) => pool.weights[Array.from(pool.verses).indexOf(verse)];
    expect(weightOf(famous)).toBeCloseTo(1 / Math.sqrt(101));
    expect(weightOf(obscure)).toBeCloseTo(1 / Math.sqrt(2));
    expect(weightOf(disputed)).toBe(1);
  });

  it('is empty when no link passes the filter', () => {
    expect(wanderPool(index, verseGenres, createLinkFilter(100)).verses).toHaveLength(0);
  });
});

describe('pickWanderVerse', () => {
  it('leans away from the verses readers voted on most, without ruling them out', () => {
    const famous = verseIndex('Gen', 1, 1);
    const obscure = verseIndex('Gen', 1, 2);
    const pool = wanderPool(
      indexOf([...hubs(famous, 1, 4, 5000, 100), ...hubs(obscure, 1, 4, 6000, 1)]),
      verseGenres,
      EVERY_LINK,
    );
    const random = seededRandom(1);
    const picks = Array.from({ length: 4000 }, () => pickWanderVerse(pool, NOWHERE, [], random));
    const times = (verse: number) => picks.filter((pick) => pick === verse).length;
    // About seven to one: √(101 / 2).
    expect(times(obscure)).toBeGreaterThan(5 * times(famous));
    expect(times(famous)).toBeGreaterThan(0);
  });

  it('never picks the passage on screen', () => {
    const random = seededRandom(2);
    const pool = poolOf(1, 2, 3);
    for (let i = 0; i < 300; i += 1) {
      expect(pickWanderVerse(pool, (verse) => verse === 2, [], random)).not.toBe(2);
    }
    // A chapter on screen rules out every verse in it.
    expect(pickWanderVerse(pool, (verse) => verse <= 2, [], random)).toBe(3);
  });

  it('never picks a recent pick while anything else is left', () => {
    const random = seededRandom(3);
    const pool = poolOf(...Array.from({ length: 20 }, (_, i) => i));
    const recent = Array.from({ length: RECENT_PICKS }, (_, i) => i);
    for (let i = 0; i < 300; i += 1) {
      expect(pickWanderVerse(pool, NOWHERE, recent, random)).toBeGreaterThanOrEqual(RECENT_PICKS);
    }
  });

  it('lets the oldest recent pick back first when nothing else is left', () => {
    const random = seededRandom(4);
    const isHere = (verse: number) => verse === 3;
    expect(pickWanderVerse(poolOf(1, 2, 3), isHere, [1, 2], random)).toBe(1);
    expect(pickWanderVerse(poolOf(1, 2, 3), isHere, [2, 1], random)).toBe(2);
  });

  it('has nowhere to go when the pool holds only the passage on screen', () => {
    const random = seededRandom(5);
    expect(pickWanderVerse(poolOf(1), (verse) => verse === 1, [1], random)).toBeNull();
    expect(pickWanderVerse(poolOf(), NOWHERE, [], random)).toBeNull();
  });

  it('picks the same verses for the same seed', () => {
    const pool = poolOf(...Array.from({ length: 50 }, (_, i) => i));
    const walk = (seed: number) => {
      const random = seededRandom(seed);
      let recent: readonly number[] = [];
      for (let i = 0; i < 8; i += 1) {
        const verse = pickWanderVerse(pool, NOWHERE, recent, random);
        if (verse === null) throw new Error('Nowhere to go');
        recent = rememberPick(recent, verse);
      }
      return recent;
    };
    expect(walk(6)).toEqual(walk(6));
    expect(walk(6)).not.toEqual(walk(7));
    // Eight picks, none of them twice.
    expect(new Set(walk(6)).size).toBe(8);
  });
});

describe('rememberPick', () => {
  it('keeps the last few picks, the newest last', () => {
    let recent: readonly number[] = [];
    for (let verse = 1; verse <= RECENT_PICKS + 2; verse += 1) {
      recent = rememberPick(recent, verse);
    }
    expect(recent).toEqual(Array.from({ length: RECENT_PICKS }, (_, i) => i + 3));
  });

  it('moves a verse picked again to the end rather than keeping it twice', () => {
    expect(rememberPick([1, 2, 3], 1)).toEqual([2, 3, 1]);
  });
});
