import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import {
  createCrossReferenceColumns,
  verseIndex,
  type LinkSpec,
} from '../../test-utils/fixtures.ts';
import { findConnectionPath } from './connection-path.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER, type LinkFilter } from './link-filter.ts';
import { computeVerseGenres } from './verse-genres.ts';

const GENRES = computeVerseGenres(CANONICAL_VERSIFICATION);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const ISA_7_14 = verseIndex('Isa', 7, 14);
const MATT_1_23 = verseIndex('Matt', 1, 23);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);
const REV_20_2 = verseIndex('Rev', 20, 2);

function at(verse: VerseIndex) {
  return { start: verse, end: verse };
}

function pathOf(
  links: readonly LinkSpec[],
  from: VerseIndex,
  to: VerseIndex,
  filter: LinkFilter = createLinkFilter(-Infinity),
) {
  const index = new CrossReferenceIndex(
    createCrossReferenceColumns(links),
    CANONICAL_VERSIFICATION.verseCount,
  );
  return findConnectionPath(index, at(from), at(to), filter, GENRES);
}

describe('findConnectionPath', () => {
  it('follows a chain of references from one verse to another', () => {
    const path = pathOf(
      [
        { from: GEN_3_15, to: ROM_16_20, votes: 10 },
        { from: ROM_16_20, to: REV_12_9, votes: 5 },
      ],
      GEN_3_15,
      REV_12_9,
    );
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, ROM_16_20, REV_12_9]);
    expect(path?.[0]?.hop).toBeNull();
    expect(path?.[2]?.hop).toMatchObject({ votes: 5, direction: 'outgoing' });
  });

  it('walks a link against its direction, since it joins the two passages either way', () => {
    const path = pathOf([{ from: REV_12_9, to: GEN_3_15, votes: 3 }], GEN_3_15, REV_12_9);
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, REV_12_9]);
    expect(path?.[1]?.hop?.direction).toBe('incoming');
  });

  it('takes the fewest links, even when a longer chain is better supported', () => {
    const path = pathOf(
      [
        { from: GEN_3_15, to: REV_12_9, votes: 1 },
        { from: GEN_3_15, to: ROM_16_20, votes: 100 },
        { from: ROM_16_20, to: REV_12_9, votes: 100 },
      ],
      GEN_3_15,
      REV_12_9,
    );
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, REV_12_9]);
  });

  it('prefers, among the shortest chains, the one readers voted for most', () => {
    const path = pathOf(
      [
        { from: GEN_3_15, to: ISA_7_14, votes: 2 },
        { from: ISA_7_14, to: REV_12_9, votes: 2 },
        { from: GEN_3_15, to: ROM_16_20, votes: 30 },
        { from: ROM_16_20, to: REV_12_9, votes: 30 },
      ],
      GEN_3_15,
      REV_12_9,
    );
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, ROM_16_20, REV_12_9]);
  });

  it('counts the whole of a linked range as reached', () => {
    const path = pathOf(
      [{ from: GEN_3_15, to: REV_12_9, toEnd: verseIndex('Rev', 12, 11), votes: 4 }],
      GEN_3_15,
      verseIndex('Rev', 12, 10),
    );
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, verseIndex('Rev', 12, 10)]);
  });

  it('starts from any verse of a chapter and stops at any verse of the destination', () => {
    const index = new CrossReferenceIndex(
      createCrossReferenceColumns([{ from: GEN_3_15, to: REV_20_2, votes: 9 }]),
      CANONICAL_VERSIFICATION.verseCount,
    );
    const genesis3 = CANONICAL_VERSIFICATION.chapterRange('Gen', 3);
    const revelation20 = CANONICAL_VERSIFICATION.chapterRange('Rev', 20);
    if (!genesis3 || !revelation20) throw new Error('Missing chapter');
    const path = findConnectionPath(
      index,
      genesis3,
      revelation20,
      createLinkFilter(-Infinity),
      GENRES,
    );
    expect(path?.map((step) => step.verse)).toEqual([GEN_3_15, REV_20_2]);
  });

  it('is a single step when the passage already contains the destination', () => {
    const path = pathOf([], GEN_3_15, GEN_3_15);
    expect(path).toEqual([{ verse: GEN_3_15, hop: null }]);
  });

  it('finds nothing when no chain of links joins the two', () => {
    expect(pathOf([{ from: GEN_3_15, to: ISA_7_14 }], GEN_3_15, MATT_1_23)).toBeNull();
  });

  it('only uses the links the filter shows', () => {
    const links = [
      { from: ISA_7_14, to: MATT_1_23, votes: 2 },
      { from: MATT_1_23, to: REV_12_9, votes: 50 },
    ];
    expect(pathOf(links, ISA_7_14, REV_12_9, DEFAULT_LINK_FILTER)).toBeNull();
    expect(pathOf(links, ISA_7_14, REV_12_9)?.length).toBe(3);
  });
});
