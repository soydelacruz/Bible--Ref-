import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import { buildArcInstances } from './arc-instances.ts';
import { LitLinksSearch, runLitLinksSearch, SLICE_MS, type LitLinks } from './lit-links.ts';

const versification = CANONICAL_VERSIFICATION;
const TOTAL = versification.verseCount;
const genres = computeVerseGenres(versification);
const range = (book: Parameters<typeof versification.bookRange>[0]) =>
  versification.bookRange(book);

const GEN_1_1 = verseIndex('Gen', 1, 1);
const EXOD_3_14 = verseIndex('Exod', 3, 14);
const PS_23_1 = verseIndex('Ps', 23, 1);
const JOHN_1_1 = verseIndex('John', 1, 1);
const JOHN_10_11 = verseIndex('John', 10, 11);
// Listed in source order, which is the order the index numbers them in.
const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_1_1, to: JOHN_1_1, votes: 10 }, // 0: from Genesis
    { from: EXOD_3_14, to: JOHN_1_1, votes: 0 }, // 1: from Exodus
    { from: JOHN_1_1, to: GEN_1_1, toEnd: verseIndex('Gen', 1, 3), votes: 250 }, // 2: into Genesis
    { from: JOHN_10_11, to: PS_23_1, votes: -3 }, // 3: into the Psalms
    { from: JOHN_10_11, to: JOHN_1_1, votes: 99 }, // 4: John to John
  ]),
  TOTAL,
);
const all = Int32Array.of(0, 1, 2, 3, 4);

/** The whole search at once. */
const litLinks = (linkIds: Int32Array, books: { start: number; end: number }): LitLinks => {
  const lit = new LitLinksSearch(index, linkIds, books, genres).step(Infinity);
  if (!lit) throw new Error('A search with all the time it needs finishes.');
  return lit;
};
const idsLit = (linkIds: Int32Array, books: { start: number; end: number }) => [
  ...litLinks(linkIds, books).ids,
];

describe('the links lit books light up', () => {
  it('are those that start or end in them, in the order given', () => {
    expect(idsLit(all, range('Gen'))).toEqual([0, 2]);
    expect(idsLit(all, range('Ps'))).toEqual([3]);
    expect(idsLit(all, range('John'))).toEqual([0, 1, 2, 3, 4]);
    expect(idsLit(Int32Array.of(4, 2, 0), range('Gen'))).toEqual([2, 0]);
  });

  it('include a link whose target passage only partly overlaps them', () => {
    const genesisOneTwo = { start: verseIndex('Gen', 1, 2), end: verseIndex('Gen', 1, 2) };
    expect(idsLit(all, genesisOneTwo)).toEqual([2]);
  });

  it('come only from the links given (those that pass the filter)', () => {
    const lit = litLinks(Int32Array.of(1, 4), range('Gen'));
    expect(lit.ids).toHaveLength(0);
    expect(lit.instances.count).toBe(0);
  });

  it('come with their arcs, as the background draws them', () => {
    const lit = litLinks(all, range('John'));
    expect(lit.range).toEqual(range('John'));
    expect(lit.instances).toEqual(buildArcInstances(index, all, genres));
  });

  it('are the same as a plain look at every link, whatever the books', () => {
    // Links at random over the whole canon, some to passages of a few verses.
    let seed = 7;
    const random = (below: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % below;
    };
    const links = Array.from({ length: 600 }, () => {
      const to = random(TOTAL - 3);
      return { from: random(TOTAL), to, toEnd: to + random(3), votes: random(120) - 10 };
    });
    const randomIndex = new CrossReferenceIndex(createCrossReferenceColumns(links), TOTAL);
    const shown = Int32Array.from({ length: 600 }, (_, id) => id).filter((id) => id % 3 !== 0);
    for (const books of [range('Gen'), range('Ruth'), { start: 0, end: range('Zech').end }]) {
      const lit = new LitLinksSearch(randomIndex, shown, books, genres, 7).step(Infinity);
      const touches = (id: number) => {
        const { from, targetStart, targetEnd } = randomIndex.link(id);
        const inside = from >= books.start && from <= books.end;
        return inside || (targetStart <= books.end && targetEnd >= books.start);
      };
      expect([...(lit?.ids ?? [])]).toEqual([...shown.filter(touches)]);
      expect(lit?.instances).toEqual(buildArcInstances(randomIndex, shown.filter(touches), genres));
    }
  });
});

describe('a search for lit links', () => {
  it('goes a slice at a time once its time is up, and picks up where it stopped', () => {
    // Two links a slice: three slices to look at all five, one more to build the two lit.
    const search = new LitLinksSearch(index, all, range('Gen'), genres, 2);
    const steps: (LitLinks | null)[] = [];
    for (let slice = 0; slice < 4; slice += 1) {
      steps.push(search.step(-Infinity));
    }
    expect(steps.slice(0, 3)).toEqual([null, null, null]);
    expect(steps[3]).toEqual(litLinks(all, range('Gen')));
    // Through, it keeps what it found.
    expect(search.step(-Infinity)).toBe(steps[3]);
  });

  it('is through as soon as it has looked at every link when none is lit', () => {
    const search = new LitLinksSearch(index, Int32Array.of(1, 4), range('Gen'), genres, 1);
    expect(search.step(-Infinity)).toBeNull();
    expect(search.step(-Infinity)?.ids).toHaveLength(0);
  });
});

describe('running a search', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds a few books’ links in the frame they are asked for', () => {
    const frame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', frame);
    const onFound = vi.fn();
    runLitLinksSearch(new LitLinksSearch(index, all, range('Ps'), genres), onFound);
    expect(onFound).toHaveBeenCalledWith(litLinks(all, range('Ps')));
    expect(frame).not.toHaveBeenCalled();
  });

  it('carries on a slice per frame until it is through, then stops', () => {
    // A clock that runs past each slice's time on every look, so every slice is one look long.
    let now = 0;
    vi.stubGlobal('performance', { now: () => (now += SLICE_MS) });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    const onFound = vi.fn();
    runLitLinksSearch(new LitLinksSearch(index, all, range('Gen'), genres, 2), onFound);
    let frame = 0;
    while (frames[frame]) {
      expect(onFound).not.toHaveBeenCalled();
      frames[frame]?.(now);
      frame += 1;
    }
    expect(frame).toBe(3); // Four slices: one at once, three in frames.
    expect(onFound).toHaveBeenCalledExactlyOnceWith(litLinks(all, range('Gen')));
  });

  it('stops when cancelled', () => {
    let now = 0;
    vi.stubGlobal('performance', { now: () => (now += SLICE_MS) });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onFound = vi.fn();
    const cancel = runLitLinksSearch(
      new LitLinksSearch(index, all, range('Gen'), genres, 2),
      onFound,
    );
    cancel();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
  });

  it('has nothing to stop once it is through', () => {
    const onFound = vi.fn();
    const cancel = runLitLinksSearch(new LitLinksSearch(index, all, range('Ps'), genres), onFound);
    expect(cancel).not.toThrow();
    expect(onFound).toHaveBeenCalledOnce();
  });
});
