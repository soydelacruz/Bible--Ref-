import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../../shared/link-filter.ts';
import {
  planFinale,
  planStops,
  planTour,
  TOUR_FINALE,
  TOUR_STOPS,
  type TourData,
} from './tour-plan.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);
const JOHN_1_1 = verseIndex('John', 1, 1);
const DEUT_6_4 = verseIndex('Deut', 6, 4);
const MARK_12_29 = verseIndex('Mark', 12, 29);
const PS_22_1 = verseIndex('Ps', 22, 1);
const MATT_27_46 = verseIndex('Matt', 27, 46);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const ISA_7_14 = verseIndex('Isa', 7, 14);
const REV_22_13 = verseIndex('Rev', 22, 13);

function tourData(links: Parameters<typeof createVizData>[0]): TourData {
  const data = createVizData(links);
  return {
    versification: data.versification,
    index: data.crossReferences.index,
    verseGenres: data.verseGenres,
  };
}

describe('TOUR_STOPS', () => {
  it('names passages that all exist, in the order of the canon', () => {
    const data = tourData([]);
    expect(() => planStops(data, DEFAULT_LINK_FILTER)).not.toThrow();
    expect(TOUR_STOPS.map((stop) => stop.key)).toEqual([
      'beginning',
      'shema',
      'forsaken',
      'servant',
      'spirit',
    ]);
    expect(TOUR_FINALE).toEqual({ from: 'Gen.3.15', to: 'Rev.22.13' });
  });
});

describe('planStops', () => {
  it('keeps the stops whose link the filter shows, with the best-rated one between them', () => {
    const data = tourData([
      { from: GEN_1_1, to: JOHN_1_1, toEnd: JOHN_1_1 + 2, votes: 379 },
      { from: JOHN_1_1, to: GEN_1_1, votes: 338 },
      // Either way round: here the later passage points back at the stop.
      { from: MARK_12_29, to: DEUT_6_4, votes: 29 },
    ]);
    const stops = planStops(data, DEFAULT_LINK_FILTER);
    expect(stops.map((stop) => stop.key)).toEqual(['beginning', 'shema']);
    const [beginning, shema] = stops;
    expect(beginning).toMatchObject({
      passage: { kind: 'verse', verse: GEN_1_1 },
      range: { start: GEN_1_1, end: GEN_1_1 },
      answer: { kind: 'verse', verse: JOHN_1_1 },
      answerRange: { start: JOHN_1_1, end: JOHN_1_1 },
    });
    expect(data.index.link(beginning?.linkId ?? -1).votes).toBe(379);
    expect(data.index.link(shema?.linkId ?? -1).from).toBe(MARK_12_29);
  });

  it('takes a whole chapter as the stop when it names one', () => {
    const data = tourData([{ from: PS_22_1, to: MATT_27_46, votes: 43 }]);
    const [forsaken] = planStops(data, DEFAULT_LINK_FILTER);
    const psalm = CANONICAL_VERSIFICATION.chapterRange('Ps', 22);
    expect(forsaken?.passage).toEqual({ kind: 'chapter', book: 'Ps', chapter: 22 });
    expect(forsaken?.range).toEqual(psalm);
  });

  it('drops a stop whose only link the filter hides', () => {
    const data = tourData([{ from: GEN_1_1, to: JOHN_1_1, votes: 10 }]);
    expect(planStops(data, DEFAULT_LINK_FILTER)).toHaveLength(1);
    expect(planStops(data, createLinkFilter(50))).toEqual([]);
  });

  it('ignores links from the stop to anywhere else', () => {
    const data = tourData([{ from: GEN_1_1, to: ISA_7_14, votes: 90 }]);
    expect(planStops(data, DEFAULT_LINK_FILTER)).toEqual([]);
  });
});

describe('planFinale', () => {
  const chain = [
    { from: GEN_3_15, to: ISA_7_14, votes: 57 },
    { from: JOHN_1_1, to: ISA_7_14, votes: 77 },
    { from: JOHN_1_1, to: REV_22_13, votes: 178 },
  ];

  it('finds the chain from the promise in Eden to Alpha and Omega', () => {
    const steps = planFinale(tourData(chain), DEFAULT_LINK_FILTER);
    expect(steps?.map((step) => step.verse)).toEqual([GEN_3_15, ISA_7_14, JOHN_1_1, REV_22_13]);
    expect(steps?.[2]?.hop?.direction).toBe('incoming');
  });

  it('gives up when the filter breaks the chain', () => {
    expect(planFinale(tourData(chain), createLinkFilter(60))).toBeNull();
  });

  it('gives up on no chain at all', () => {
    expect(planFinale(tourData([]), DEFAULT_LINK_FILTER)).toBeNull();
  });
});

describe('planTour', () => {
  it('is the stops and the finale together', () => {
    const plan = planTour(
      tourData([
        { from: GEN_1_1, to: JOHN_1_1, votes: 10 },
        { from: GEN_3_15, to: REV_22_13, votes: 10 },
      ]),
      DEFAULT_LINK_FILTER,
    );
    expect(plan.stops).toHaveLength(1);
    expect(plan.finale?.map((step) => step.verse)).toEqual([GEN_3_15, REV_22_13]);
  });
});
