import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { getGenre } from '../../core/bible/genres.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { DEFAULT_LINK_FILTER } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import { drawnLinks, groupHighlight, passageHighlight } from './cluster-highlight.ts';
import { computeClusterLayout, selectClusterGraph, type ClusterLayout } from './cluster-layout.ts';

const versification = CANONICAL_VERSIFICATION;
const verseGenres = computeVerseGenres(versification);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const PS_22_1 = verseIndex('Ps', 22, 1);
const MATT_27_46 = verseIndex('Matt', 27, 46);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);

const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_3_15, to: ROM_16_20, votes: 40 },
    { from: GEN_3_15, to: REV_12_9, votes: 12 },
    { from: PS_22_1, to: MATT_27_46, votes: 80 },
    { from: MATT_27_46, to: PS_22_1, votes: 70 },
    { from: REV_12_9, to: GEN_3_15, votes: 9 },
  ]),
  versification.verseCount,
);

function setUp(openBook: 'Gen' | null = null) {
  const graph = selectClusterGraph(
    index,
    verseGenres,
    DEFAULT_LINK_FILTER,
    versification,
    openBook,
  );
  const layout = computeClusterLayout(graph, versification, openBook, {
    width: 1000,
    height: 700,
  });
  return { graph, layout, drawn: drawnLinks(index.linkCount, graph.linkIds) };
}

function position(layout: ClusterLayout, verse: number): number {
  return layout.nodeOf[verse] ?? -1;
}

describe('passageHighlight', () => {
  it('grows every link of a verse out from it, colored by where it lands', () => {
    const { layout, drawn } = setUp();
    const highlight = passageHighlight(
      layout,
      index,
      drawn,
      { start: GEN_3_15, end: GEN_3_15 },
      DEFAULT_LINK_FILTER,
      verseGenres,
    );
    const here = position(layout, GEN_3_15);
    expect([...highlight.segments.from]).toEqual([here, here, here]);
    expect([...highlight.segments.to].sort()).toEqual(
      [ROM_16_20, REV_12_9, REV_12_9].map((verse) => position(layout, verse)).sort(),
    );
    expect(highlight.segments.genre).toContain(getGenre('pauline-epistles').ordinal);
    expect(highlight.segments.genre).toContain(getGenre('revelation').ordinal);
    expect(highlight.ringed).toEqual([here]);
    expect(highlight.marked).toContain(position(layout, ROM_16_20));
  });

  it('counts a link once when both of its ends are in the passage', () => {
    const { layout, drawn } = setUp();
    const range = versification.bookRange('Ps');
    const highlight = passageHighlight(
      layout,
      index,
      drawn,
      range,
      DEFAULT_LINK_FILTER,
      verseGenres,
    );
    expect(highlight.segments.from).toHaveLength(2);
  });

  it('leaves out links that are not drawn, and rings nothing without a dot', () => {
    const { layout, drawn } = setUp('Gen');
    const highlight = passageHighlight(
      layout,
      index,
      drawn,
      { start: MATT_27_46 - 1, end: MATT_27_46 },
      DEFAULT_LINK_FILTER,
      verseGenres,
    );
    expect(highlight.segments.from).toHaveLength(0);
    expect(highlight.ringed).toEqual([]);
  });
});

describe('groupHighlight', () => {
  it('draws every link that touches a book, from the book outward', () => {
    const { graph, layout } = setUp();
    const genesis = layout.groups.findIndex((group) => group.book === 'Gen');
    const highlight = groupHighlight(layout, index, graph.linkIds, genesis, verseGenres);
    expect(highlight.segments.from).toHaveLength(3);
    for (const from of highlight.segments.from) {
      expect(layout.nodeGroup[from]).toBe(genesis);
    }
    expect(highlight.ringed).toEqual([]);
  });

  it('draws nothing for a cluster that is not there', () => {
    const { graph, layout } = setUp();
    const highlight = groupHighlight(layout, index, graph.linkIds, 99, verseGenres);
    expect(highlight.segments.from).toHaveLength(0);
    expect(highlight.marked).toEqual([]);
  });
});

describe('drawnLinks', () => {
  it('flags the drawn links by ID', () => {
    expect([...drawnLinks(4, Int32Array.from([1, 3]))]).toEqual([0, 1, 0, 1]);
  });
});
