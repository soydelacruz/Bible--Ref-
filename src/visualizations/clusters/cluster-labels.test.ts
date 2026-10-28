import { describe, expect, it } from 'vitest';
import type { BookId } from '../../core/bible/books.ts';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { enBooks } from '../../i18n/books/en.ts';
import { createCrossReferenceColumns } from '../../test-utils/fixtures.ts';
import { DEFAULT_LINK_FILTER } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import {
  labelAt,
  placeClusterLabels,
  type ClusterLabel,
  type LabelBox,
  type LabelSetting,
} from './cluster-labels.ts';
import {
  computeClusterLayout,
  selectClusterGraph,
  type ClusterGroup,
  type ClusterLayout,
} from './cluster-layout.ts';

const versification = CANONICAL_VERSIFICATION;
const verseGenres = computeVerseGenres(versification);

/** Every verse linked to the next: a dot for every verse, so each book is as big as it is. */
const wholeBible = new CrossReferenceIndex(
  createCrossReferenceColumns(
    Array.from({ length: versification.verseCount - 1 }, (_, verse) => ({
      from: verse,
      to: verse + 1,
      votes: 10,
    })),
  ),
  versification.verseCount,
);

/** Type about as wide as the app's 11px system font, a fixed width per character. */
const PER_CHARACTER = { name: 6.2, chapter: 5.6, heading: 7.6 } as const;

const SETTING: LabelSetting = {
  measure: (text, kind) => text.length * PER_CHARACTER[kind],
  name: (group) =>
    group.chapter === null
      ? {
          full: enBooks[group.book].name,
          short: enBooks[group.book].abbreviation ?? group.book,
        }
      : { full: String(group.chapter), short: String(group.chapter) },
  headings: { start: 'Old Testament', center: 'Psalms', end: 'New Testament' },
};

function pictureOf(width: number, height: number, openBook: BookId | null = null): ClusterLayout {
  const graph = selectClusterGraph(
    wholeBible,
    verseGenres,
    DEFAULT_LINK_FILTER,
    versification,
    openBook,
  );
  return computeClusterLayout(graph, versification, openBook, { width, height });
}

function overlap(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function collisions(labels: readonly ClusterLabel[]): string[] {
  return labels.flatMap((label, i) =>
    labels
      .slice(i + 1)
      .filter((other) => overlap(label.box, other.box))
      .map((other) => `${label.text} / ${other.text}`),
  );
}

/** A picture of hand-placed clusters, with no dots: all that placing their names looks at. */
function layoutOf(
  groups: readonly Pick<ClusterGroup, 'book' | 'x' | 'y' | 'r'>[],
  width = 400,
  height = 300,
): ClusterLayout {
  return {
    width,
    height,
    orientation: 'landscape',
    bands: {},
    groups: groups.map((group) => ({ ...group, chapter: null, side: 'start', first: 0, count: 1 })),
    nodes: new Int32Array(0),
    x: new Float32Array(0),
    y: new Float32Array(0),
    nodeGroup: new Uint16Array(0),
    nodeOf: new Int32Array(0),
    spacing: 4,
    dotRadius: 1.4,
  };
}

const textOf = (labels: readonly ClusterLabel[], book: BookId) =>
  labels.find((label) => label.key === `${book}.`)?.text ?? null;

describe('placeClusterLabels', () => {
  const sizes = [
    ['a desktop', 1440, 760],
    ['a laptop', 1024, 600],
    ['a phone', 412, 640],
    ['a phone under the details sheet', 412, 330],
    ['the narrowest phone', 320, 480],
  ] as const;

  it.each(sizes)('lets no two names overlap on %s', (_, width, height) => {
    const layout = pictureOf(width, height);
    const labels = placeClusterLabels(layout, SETTING);
    expect(collisions(labels)).toEqual([]);
    // Most of the Bible is named, not just a lucky few.
    expect(labels.length).toBeGreaterThan(30);
  });

  it.each(sizes)('keeps every name on the stage on %s', (_, width, height) => {
    for (const { box, text } of placeClusterLabels(pictureOf(width, height), SETTING)) {
      expect({ text, inside: box.x0 >= 0 && box.y0 >= 0 }).toEqual({ text, inside: true });
      expect({ text, inside: box.x1 <= width && box.y1 <= height }).toEqual({ text, inside: true });
    }
  });

  it("lets no two of an open book's chapters overlap", () => {
    for (const [width, height] of [
      [1440, 760],
      [412, 640],
    ] as const) {
      const labels = placeClusterLabels(pictureOf(width, height, 'Ps'), SETTING);
      expect(collisions(labels)).toEqual([]);
      expect(labels.filter((label) => label.kind === 'chapter').length).toBeGreaterThan(20);
    }
  });

  it('heads every band, and names the biggest cluster', () => {
    const labels = placeClusterLabels(pictureOf(412, 330), SETTING);
    expect(labels.filter((label) => label.kind === 'heading').map((label) => label.text)).toEqual([
      'OLD TESTAMENT',
      'NEW TESTAMENT',
    ]);
    expect(textOf(labels, 'Ps')).toBe('Psalms');
  });

  it('names a cluster above itself where there is room', () => {
    const layout = layoutOf([{ book: 'Gen', x: 200, y: 150, r: 40 }]);
    const [label] = placeClusterLabels(layout, SETTING);
    expect(label).toMatchObject({ text: 'Genesis', x: 200, group: 0 });
    expect(label?.y).toBeLessThan(150 - 40);
  });

  it('gives the bigger of two clusters the first choice of place', () => {
    // Side by side, so close that only one name fits above them.
    const layout = layoutOf([
      { book: 'Gen', x: 180, y: 150, r: 20 },
      { book: 'Exod', x: 222, y: 150, r: 21 },
    ]);
    const labels = placeClusterLabels(layout, SETTING);
    const exodus = labels.find((label) => label.group === 1);
    const genesis = labels.find((label) => label.group === 0);
    expect(exodus?.y).toBeLessThan(150 - 21);
    // The smaller one goes below instead.
    expect(genesis?.y).toBeGreaterThan(150 + 20);
    expect(collisions(labels)).toEqual([]);
  });

  it('puts a name beside its cluster when above and below are taken', () => {
    // Pressed between the top and bottom of the stage: only the sides are left.
    const layout = layoutOf([{ book: 'Ruth', x: 200, y: 50, r: 44 }], 400, 100);
    const [label] = placeClusterLabels(layout, SETTING);
    expect(label?.x).toBeGreaterThan(200 + 44);
    expect(label?.y).toBeCloseTo(50 + 11 / 2, 6);
  });

  it('shortens a name that has no room in full', () => {
    // The stage is narrower than the full name.
    const layout = layoutOf([{ book: '1Thess', x: 45, y: 100, r: 40 }], 90, 200);
    expect(placeClusterLabels(layout, SETTING).map((label) => label.text)).toEqual(['1Thess']);
  });

  it('leaves out a name with no room at all', () => {
    const layout = layoutOf([{ book: 'Deut', x: 20, y: 20, r: 18 }], 40, 40);
    expect(placeClusterLabels(layout, SETTING)).toEqual([]);
  });

  it('keeps a name out of the middle of another cluster where it can', () => {
    // On a stage too low for names above or below: to Joel's right is the middle of Isaiah.
    const layout = layoutOf(
      [
        { book: 'Isa', x: 150, y: 20, r: 30 },
        { book: 'Joel', x: 100, y: 20, r: 8 },
      ],
      400,
      40,
    );
    const labels = placeClusterLabels(layout, SETTING);
    expect(labels.find((label) => label.group === 0)?.x).toBeGreaterThan(150 + 30);
    expect(labels.find((label) => label.group === 1)?.x).toBeLessThan(100 - 8);
  });

  it('crosses another cluster rather than leave a name out', () => {
    // Joel is inside a ring of big clusters: every place around it reaches into one of them.
    const layout = layoutOf([
      { book: 'Joel', x: 200, y: 150, r: 6 },
      { book: 'Isa', x: 200, y: 105, r: 34 },
      { book: 'Jer', x: 200, y: 195, r: 34 },
      { book: 'Ezek', x: 132, y: 150, r: 50 },
      { book: 'Dan', x: 268, y: 150, r: 50 },
    ]);
    const labels = placeClusterLabels(layout, SETTING);
    expect(textOf(labels, 'Joel')).toBe('Joel');
    expect(collisions(labels)).toEqual([]);
  });

  it('places the same names in the same places every time', () => {
    const layout = pictureOf(412, 640);
    expect(placeClusterLabels(layout, SETTING)).toEqual(placeClusterLabels(layout, SETTING));
  });
});

describe('labelAt', () => {
  const labels = placeClusterLabels(
    layoutOf([
      { book: 'Gen', x: 100, y: 150, r: 30 },
      { book: 'Exod', x: 300, y: 150, r: 30 },
    ]),
    { ...SETTING, headings: {} },
  );

  it('finds the cluster whose name is under a point, wherever it was put', () => {
    const exodus = labels.find((label) => label.group === 1);
    expect(exodus).toBeDefined();
    expect(labelAt(labels, exodus?.x ?? NaN, (exodus?.y ?? NaN) - 4)).toBe(1);
  });

  it('finds nothing away from the names, or on a heading', () => {
    expect(labelAt(labels, 200, 150)).toBeNull();
    const heading: ClusterLabel = {
      key: 'start',
      text: 'OLD TESTAMENT',
      kind: 'heading',
      x: 50,
      y: 20,
      box: { x0: 0, x1: 100, y0: 10, y1: 25 },
      group: null,
    };
    expect(labelAt([heading], 50, 20)).toBeNull();
  });
});
