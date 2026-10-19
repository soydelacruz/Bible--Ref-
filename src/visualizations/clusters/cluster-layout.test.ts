import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import {
  computeBands,
  computeClusterLayout,
  fitSpacing,
  groupAt,
  LABEL_ROOM,
  selectClusterGraph,
  verseAt,
  type ClusterLayout,
} from './cluster-layout.ts';

const versification = CANONICAL_VERSIFICATION;
const verseGenres = computeVerseGenres(versification);
const GEN_1_1 = verseIndex('Gen', 1, 1);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const PS_23_1 = verseIndex('Ps', 23, 1);
const ISA_53_5 = verseIndex('Isa', 53, 5);
const JOHN_1_1 = verseIndex('John', 1, 1);
const JOHN_3_16 = verseIndex('John', 3, 16);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);

const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_1_1, to: JOHN_1_1, votes: 90 },
    { from: GEN_3_15, to: ROM_16_20, toEnd: ROM_16_20 + 1, votes: 40 },
    { from: GEN_3_15, to: REV_12_9, votes: 12 },
    { from: PS_23_1, to: ISA_53_5, votes: 5 },
    { from: JOHN_3_16, to: ISA_53_5, votes: 2 },
    { from: JOHN_1_1, to: GEN_1_1, votes: -3 },
  ]),
  versification.verseCount,
);

const SIZE = { width: 1200, height: 800 };

function graphOf(openBook: 'Gen' | null = null) {
  return selectClusterGraph(index, verseGenres, DEFAULT_LINK_FILTER, versification, openBook);
}

function positionOf(layout: ClusterLayout, verse: number): { x: number; y: number } {
  const position = layout.nodeOf[verse] ?? -1;
  return { x: layout.x[position] ?? NaN, y: layout.y[position] ?? NaN };
}

describe('selectClusterGraph', () => {
  it('keeps the links that pass the filter, and the verses at their two ends', () => {
    const graph = graphOf();
    expect(graph.linkIds).toHaveLength(4);
    expect([...graph.nodes]).toEqual([
      GEN_1_1,
      GEN_3_15,
      PS_23_1,
      ISA_53_5,
      JOHN_1_1,
      ROM_16_20,
      REV_12_9,
    ]);
  });

  it('shows every link, disputed ones too, when the filter asks for all', () => {
    const graph = selectClusterGraph(
      index,
      verseGenres,
      createLinkFilter(-Infinity),
      versification,
      null,
    );
    expect(graph.linkIds).toHaveLength(6);
    expect(graph.nodes).toContain(JOHN_3_16);
  });

  it('keeps only the links that touch an opened book', () => {
    const graph = graphOf('Gen');
    expect(graph.linkIds).toHaveLength(3);
    expect(graph.nodes).not.toContain(PS_23_1);
    expect(graph.nodes).toContain(REV_12_9);
  });
});

describe('computeBands', () => {
  it('puts the testaments side by side on a wide stage, one above the other on a tall one', () => {
    const wide = computeBands(1200, 800, false);
    expect(wide.orientation).toBe('landscape');
    expect(wide.bands.start.x1).toBeLessThan(wide.bands.end.x0);
    const tall = computeBands(400, 800, false);
    expect(tall.orientation).toBe('portrait');
    expect(tall.bands.start.y1).toBeLessThan(tall.bands.end.y0);
  });

  it('opens a middle column for a book between the two testaments', () => {
    const { bands } = computeBands(1200, 800, true);
    expect(bands.start.x1).toBeLessThan(bands.center.x0);
    expect(bands.center.x1).toBeLessThan(bands.end.x0);
  });
});

describe('fitSpacing', () => {
  const { bands } = computeBands(1200, 800, false);

  it('shrinks the dots as there are more of them', () => {
    const few = fitSpacing([{ side: 'start', count: 100 }], bands);
    const many = fitSpacing([{ side: 'start', count: 20_000 }], bands);
    expect(many).toBeLessThan(few);
  });

  it('keeps dots within readable bounds', () => {
    expect(fitSpacing([{ side: 'end', count: 1 }], bands)).toBe(14);
    expect(fitSpacing([{ side: 'end', count: 10_000_000 }], bands)).toBe(1.5);
  });
});

describe('computeClusterLayout', () => {
  const graph = graphOf();
  const layout = computeClusterLayout(graph, versification, null, SIZE);

  it('makes one cluster per book, the Old Testament on the left and the New on the right', () => {
    expect(layout.groups.map((group) => group.book)).toEqual([
      'Gen',
      'Ps',
      'Isa',
      'John',
      'Rom',
      'Rev',
    ]);
    for (const group of layout.groups) {
      expect(group.x < SIZE.width / 2).toBe(group.side === 'start');
      expect(group.chapter).toBeNull();
    }
    expect(Object.keys(layout.bands).sort()).toEqual(['end', 'start']);
  });

  it('places every dot inside its cluster', () => {
    layout.nodes.forEach((verse, position) => {
      const group = layout.groups[layout.nodeGroup[position] ?? -1];
      const { x, y } = positionOf(layout, verse);
      expect(group).toBeDefined();
      expect(Math.hypot(x - (group?.x ?? 0), y - (group?.y ?? 0))).toBeLessThanOrEqual(
        group?.r ?? 0,
      );
    });
  });

  it('keeps clusters apart and inside the stage, with room above each for its name', () => {
    layout.groups.forEach((a, i) => {
      const band = layout.bands[a.side];
      expect(a.y - a.r).toBeGreaterThanOrEqual((band?.y0 ?? 0) + LABEL_ROOM - 1e-6);
      expect(a.x - a.r).toBeGreaterThanOrEqual(0);
      expect(a.x + a.r).toBeLessThanOrEqual(SIZE.width);
      layout.groups.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      });
    });
  });

  it('draws the same picture every time', () => {
    const again = computeClusterLayout(graph, versification, null, SIZE);
    expect([...again.x]).toEqual([...layout.x]);
    expect([...again.y]).toEqual([...layout.y]);
  });

  it('maps verses without a dot to −1', () => {
    expect(layout.nodeOf[JOHN_3_16]).toBe(-1);
    expect(layout.nodeOf[GEN_1_1]).toBe(0);
  });

  it('splits an opened book into its chapters, in the middle', () => {
    const opened = computeClusterLayout(graphOf('Gen'), versification, 'Gen', SIZE);
    const chapters = opened.groups.filter((group) => group.side === 'center');
    expect(chapters.map((group) => [group.book, group.chapter])).toEqual([
      ['Gen', 1],
      ['Gen', 3],
    ]);
    expect(opened.groups.filter((group) => group.side === 'end').map((g) => g.book)).toEqual([
      'John',
      'Rom',
      'Rev',
    ]);
    expect(opened.bands.start).toBeUndefined();
    for (const chapter of chapters) {
      expect(chapter.x).toBeGreaterThan(SIZE.width * 0.3);
      expect(chapter.x).toBeLessThan(SIZE.width * 0.7);
    }
  });

  it('stacks the testaments on a tall stage', () => {
    const tall = computeClusterLayout(graph, versification, null, { width: 400, height: 900 });
    expect(tall.orientation).toBe('portrait');
    for (const group of tall.groups) {
      expect(group.y < 450).toBe(group.side === 'start');
    }
  });
});

describe('hit testing', () => {
  const layout = computeClusterLayout(graphOf(), versification, null, SIZE);

  it('finds the verse under the pointer, and its cluster', () => {
    const { x, y } = positionOf(layout, ISA_53_5);
    expect(verseAt(layout, x + 0.5, y)).toBe(ISA_53_5);
    expect(layout.groups[groupAt(layout, x, y)]?.book).toBe('Isa');
  });

  it('finds nothing in the empty space between clusters', () => {
    expect(groupAt(layout, 0, 0)).toBe(-1);
    expect(verseAt(layout, 0, 0)).toBeNull();
  });

  it('finds no verse at the edge of a cluster, away from its dots', () => {
    const genesis = layout.groups[0];
    if (!genesis) throw new Error('no Genesis cluster');
    expect(verseAt(layout, genesis.x, genesis.y - genesis.r - layout.spacing * 0.9)).toBeNull();
  });
});
