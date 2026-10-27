import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { elementAt } from '../../core/lib/array.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { findConnectionPath } from '../shared/connection-path.ts';
import { createLinkFilter } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import { computeClusterLayout, selectClusterGraph } from './cluster-layout.ts';
import { clusterPathCurve, clusterPathHops } from './cluster-path.ts';

const versification = CANONICAL_VERSIFICATION;
const GEN_3_15 = verseIndex('Gen', 3, 15);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);
const verseGenres = computeVerseGenres(versification);
const EVERY_LINK = createLinkFilter(-Infinity);

// Genesis 3:15 references Romans 16:20-21; Revelation 12:9 references Romans 16:20.
const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_3_15, to: ROM_16_20, toEnd: ROM_16_20 + 1, votes: 12 },
    { from: REV_12_9, to: ROM_16_20, votes: 1 },
  ]),
  versification.verseCount,
);

function chain() {
  const steps = findConnectionPath(
    index,
    { start: GEN_3_15, end: GEN_3_15 },
    { start: REV_12_9, end: REV_12_9 },
    EVERY_LINK,
    verseGenres,
  );
  if (!steps) throw new Error('The fixture has a path.');
  return steps;
}

function layoutOf(openBook: 'Gen' | null) {
  const graph = selectClusterGraph(index, verseGenres, EVERY_LINK, versification, openBook);
  return computeClusterLayout(graph, versification, openBook, { width: 1200, height: 800 });
}

describe('clusterPathHops', () => {
  it('travels each link between its dots, from the step before', () => {
    expect(clusterPathHops(index, chain())).toEqual([
      { from: GEN_3_15, to: ROM_16_20 },
      { from: ROM_16_20, to: REV_12_9 },
    ]);
    expect(clusterPathHops(index, [{ verse: GEN_3_15, hop: null }])).toEqual([]);
  });
});

describe('clusterPathCurve', () => {
  it('runs straight from one dot to the other, colored by their genres', () => {
    const layout = layoutOf(null);
    const curve = clusterPathCurve(layout, verseGenres, { from: ROM_16_20, to: REV_12_9 });
    const dot = (verse: number): [number, number] => {
      const position = elementAt(layout.nodeOf, verse);
      return [elementAt(layout.x, position), elementAt(layout.y, position)];
    };
    const [x0, y0] = dot(ROM_16_20);
    const [x1, y1] = dot(REV_12_9);
    expect(curve?.pointAt(0)).toEqual([x0, y0]);
    expect(curve?.pointAt(1)).toEqual([x1, y1]);
    expect(curve?.pointAt(0.5)).toEqual([(x0 + x1) / 2, (y0 + y1) / 2]);
    expect(curve?.fromGenre).toBe(7);
    expect(curve?.toGenre).toBe(9);
  });

  it('has nothing to show for a link with no dots in this picture', () => {
    // Genesis open: Revelation's link to Romans does not touch it, so neither has a dot.
    const layout = layoutOf('Gen');
    expect(clusterPathCurve(layout, verseGenres, { from: GEN_3_15, to: ROM_16_20 })).not.toBeNull();
    expect(clusterPathCurve(layout, verseGenres, { from: ROM_16_20, to: REV_12_9 })).toBeNull();
    expect(clusterPathCurve(layout, verseGenres, { from: REV_12_9, to: GEN_3_15 })).toBeNull();
  });
});
