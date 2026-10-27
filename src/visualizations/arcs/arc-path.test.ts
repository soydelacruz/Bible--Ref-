import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { findConnectionPath } from '../shared/connection-path.ts';
import { createLinkFilter } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import { computeArcLayout, verseToAlong } from './arc-layout.ts';
import { arcPathCurve, buildArcPath } from './arc-path.ts';

const GEN_3_15 = verseIndex('Gen', 3, 15);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);
const verseGenres = computeVerseGenres(CANONICAL_VERSIFICATION);
const LAW = 0;
const EPISTLES = 7;
const REVELATION = 9;

// Genesis 3:15 references Romans 16:20-21; Revelation 12:9 references Romans 16:20.
const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_3_15, to: ROM_16_20, toEnd: ROM_16_20 + 1, votes: 12 },
    { from: REV_12_9, to: ROM_16_20, votes: 1 },
  ]),
  CANONICAL_VERSIFICATION.verseCount,
);

function chain() {
  const steps = findConnectionPath(
    index,
    { start: GEN_3_15, end: GEN_3_15 },
    { start: REV_12_9, end: REV_12_9 },
    createLinkFilter(-Infinity),
    verseGenres,
  );
  if (!steps) throw new Error('The fixture has a path.');
  return steps;
}

describe('buildArcPath', () => {
  it('travels each link from the step before, the way the chain goes', () => {
    const path = buildArcPath(index, chain(), verseGenres);
    expect(path.origin).toBe(GEN_3_15);
    expect(path.hops).toEqual([
      // Genesis references Romans: from the source to the middle of the target range.
      { from: GEN_3_15 + 0.5, to: ROM_16_20 + 1, fromGenre: LAW, toGenre: EPISTLES },
      // Revelation references Romans, travelled backwards: from the target to the source.
      { from: ROM_16_20 + 0.5, to: REV_12_9 + 0.5, fromGenre: EPISTLES, toGenre: REVELATION },
    ]);
  });

  it('has no hops for a chain of one passage', () => {
    expect(buildArcPath(index, [{ verse: GEN_3_15, hop: null }], verseGenres)).toEqual({
      origin: GEN_3_15,
      hops: [],
    });
    expect(buildArcPath(index, [], verseGenres).hops).toEqual([]);
  });
});

describe('arcPathCurve', () => {
  const view = { start: 0, end: CANONICAL_VERSIFICATION.verseCount };
  const hop = { from: GEN_3_15 + 0.5, to: REV_12_9 + 0.5, fromGenre: LAW, toGenre: REVELATION };

  it('follows the arc over a horizontal axis, flattened under its ceiling', () => {
    const layout = computeArcLayout(1200, 600);
    const curve = arcPathCurve(layout, view, hop);
    const from = verseToAlong(layout, view, hop.from);
    const to = verseToAlong(layout, view, hop.to);
    expect(curve.pointAt(0)).toEqual([from, layout.baseline]);
    expect(curve.pointAt(1)[0]).toBeCloseTo(to, 6);
    expect(curve.pointAt(1)[1]).toBeCloseTo(layout.baseline, 6);
    const top = curve.pointAt(0.5);
    expect(top[0]).toBeCloseTo((from + to) / 2, 6);
    expect(top[1]).toBeCloseTo(layout.baseline - layout.maxArcHeight, 6);
    expect(curve.fromGenre).toBe(LAW);
    expect(curve.toGenre).toBe(REVELATION);
  });

  it('rises half as high as it is wide when that is lower, beside a vertical axis', () => {
    const layout = computeArcLayout(400, 900);
    const near = { ...hop, to: hop.from + 400 };
    const curve = arcPathCurve(layout, view, near);
    const from = verseToAlong(layout, view, near.from);
    const to = verseToAlong(layout, view, near.to);
    expect(curve.pointAt(0)).toEqual([layout.baseline, from]);
    const top = curve.pointAt(0.5);
    expect(top[0]).toBeCloseTo(layout.baseline + (to - from) / 2, 6);
    expect(top[1]).toBeCloseTo((from + to) / 2, 6);
  });
});
