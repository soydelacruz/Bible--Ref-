import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import { voteWeight } from '../shared/vote-weight.ts';
import {
  buildArcInstances,
  buildArcMorph,
  JOINING,
  LEAVING,
  morphChanges,
  settleArcMorph,
  STAYING,
} from './arc-instances.ts';

describe('voteWeight', () => {
  it('grows with votes, bounded to [0.2, 1]', () => {
    expect(voteWeight(-5)).toBe(0.2);
    expect(voteWeight(0)).toBe(0.2);
    expect(voteWeight(9)).toBeCloseTo(0.6);
    expect(voteWeight(1000)).toBe(1);
  });
});

describe('buildArcInstances', () => {
  it('places endpoints at verse centers and range centers', () => {
    const gen = verseIndex('Gen', 1, 1);
    const johnStart = verseIndex('John', 1, 1);
    const index = new CrossReferenceIndex(
      createCrossReferenceColumns([{ from: gen, to: johnStart, toEnd: johnStart + 2, votes: 9 }]),
      CANONICAL_VERSIFICATION.verseCount,
    );
    const instances = buildArcInstances(index, [0], computeVerseGenres(CANONICAL_VERSIFICATION));
    expect(instances.count).toBe(1);
    expect(Array.from(instances.endpoints)).toEqual([gen + 0.5, johnStart + 1.5]);
    expect(Array.from(instances.genres)).toEqual([0, 5]); // Law → Gospels
    expect(instances.weights[0]).toBeCloseTo(0.6);
  });
});

describe('a change of links', () => {
  const genres = computeVerseGenres(CANONICAL_VERSIFICATION);
  // Five links out of Genesis 1:1, to verses 10 to 50, with 0 to 4 votes.
  const gen = verseIndex('Gen', 1, 1);
  const index = new CrossReferenceIndex(
    createCrossReferenceColumns(
      [0, 1, 2, 3, 4].map((votes) => ({
        from: gen,
        to: gen + 10 * (votes + 1),
        toEnd: gen + 10 * (votes + 1),
        votes,
      })),
    ),
    CANONICAL_VERSIFICATION.verseCount,
  );
  const targets = (instances: { readonly endpoints: Float32Array }) =>
    Array.from(instances.endpoints).filter((_, i) => i % 2 === 1);

  it('holds both sets, marking what leaves, stays and joins', () => {
    const morph = buildArcMorph(index, Int32Array.of(0, 1, 3), Int32Array.of(1, 2, 3, 4), genres);
    expect(morph.instances.count).toBe(5);
    expect(Array.from(morph.states)).toEqual([LEAVING, STAYING, JOINING, STAYING, JOINING]);
    expect(targets(morph.instances)).toEqual([10.5, 20.5, 30.5, 40.5, 50.5]);
    expect(morph.before).toBe(3);
    expect(morph.after).toBe(4);
    expect(morphChanges(morph)).toBe(true);
  });

  it('settles on the links that stayed or joined', () => {
    const morph = buildArcMorph(index, Int32Array.of(0, 1, 3), Int32Array.of(1, 2, 3, 4), genres);
    const settled = settleArcMorph(morph);
    expect(settled.count).toBe(4);
    expect(targets(settled)).toEqual([20.5, 30.5, 40.5, 50.5]);
    expect(Array.from(settled.weights)).toEqual(Array.from(morph.instances.weights.subarray(1)));
    expect(Array.from(settled.genres)).toHaveLength(8);
  });

  it('starts from nothing with every link joining, and ends on nothing with every one leaving', () => {
    const first = buildArcMorph(index, new Int32Array(0), Int32Array.of(0, 4), genres);
    expect(Array.from(first.states)).toEqual([JOINING, JOINING]);
    expect(settleArcMorph(first)).toBe(first.instances);
    const last = buildArcMorph(index, Int32Array.of(0, 4), new Int32Array(0), genres);
    expect(Array.from(last.states)).toEqual([LEAVING, LEAVING]);
    expect(settleArcMorph(last).count).toBe(0);
  });

  it('changes nothing when the links are the same', () => {
    const same = buildArcMorph(index, Int32Array.of(1, 2), Int32Array.of(1, 2), genres);
    expect(Array.from(same.states)).toEqual([STAYING, STAYING]);
    expect(morphChanges(same)).toBe(false);
  });
});
