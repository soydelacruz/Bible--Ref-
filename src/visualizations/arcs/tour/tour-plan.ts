import { parsePassageOsisId, passageRange, type Passage } from '../../../core/bible/passage.ts';
import type { VerseIndexRange, Versification } from '../../../core/bible/versification.ts';
import type { CrossReferenceIndex } from '../../../cross-references/cross-reference-index.ts';
import { findConnectionPath, type PathStep } from '../../shared/connection-path.ts';
import { collectConnections } from '../../shared/connections.ts';
import type { LinkFilter } from '../../shared/link-filter.ts';

/**
 * The tour's stops, in the order of the canon: each a passage whose links light up, and the one
 * far across the Bible that it is best known for reaching. All five are among the best-rated
 * links in the data (OpenBible.info, 2026-09-21), so each shows under the default filter:
 *
 * - Genesis 1:1 → John 1:1 (379 votes): the Bible's first words, and John's.
 * - Deuteronomy 6:4 → Mark 12:29 (75): the Shema, Jesus' answer to the first commandment.
 * - Psalm 22 → Matthew 27:46 (83): the whole psalm, which has 13 links into that one chapter.
 * - Isaiah 53 → Acts 8:32 (68): the servant song, read on the road to Gaza.
 * - Joel 2:28 → Acts 2:17 (162): the Spirit poured out, at Pentecost.
 */
export const TOUR_STOPS = [
  { key: 'beginning', passage: 'Gen.1.1', answer: 'John.1.1' },
  { key: 'shema', passage: 'Deut.6.4', answer: 'Mark.12.29' },
  { key: 'forsaken', passage: 'Ps.22', answer: 'Matt.27.46' },
  { key: 'servant', passage: 'Isa.53', answer: 'Acts.8.32' },
  { key: 'spirit', passage: 'Joel.2.28', answer: 'Acts.2.17' },
] as const;

/**
 * The finale: the shortest chain of cross-references from the promise in Eden to "I am Alpha and
 * Omega". Under the default filter it runs through Isaiah 7:14 and John 1:1, so the tour ends
 * where its first stop pointed. The whole of Revelation would be no destination: Genesis 3:15
 * links straight to Revelation 12, one arc and no path.
 */
export const TOUR_FINALE = { from: 'Gen.3.15', to: 'Rev.22.13' } as const;

export type TourStopKey = (typeof TOUR_STOPS)[number]['key'];

export interface TourStop {
  /** Names the stop's words among the messages. */
  readonly key: TourStopKey;
  /** The passage focused: its links grow out of it. */
  readonly passage: Passage;
  readonly range: VerseIndexRange;
  /** The passage it reaches that the stop is about, marked on the axis. */
  readonly answer: Passage;
  readonly answerRange: VerseIndexRange;
  /** The best-rated link between the two that the filter shows. */
  readonly linkId: number;
}

export interface TourPlan {
  readonly stops: readonly TourStop[];
  /** The chain from `TOUR_FINALE.from` to `.to`, two steps or more; `null` when none shows. */
  readonly finale: readonly PathStep[] | null;
}

/** What the plan reads: the links, and what the filter needs to judge them. */
export interface TourData {
  readonly versification: Versification;
  readonly index: CrossReferenceIndex;
  readonly verseGenres: Uint8Array;
}

/**
 * The stops whose link shows under `filter`: a stop is about the arc between two passages, so
 * without it there is nothing to point at. Cheap (a few hundred links), so it can decide whether
 * there is a tour to offer at all.
 */
export function planStops(data: TourData, filter: LinkFilter): TourStop[] {
  return TOUR_STOPS.flatMap((spec) => {
    const passage = tourPassage(spec.passage, data.versification);
    const answer = tourPassage(spec.answer, data.versification);
    const range = passageRange(passage, data.versification);
    const answerRange = passageRange(answer, data.versification);
    const linkId = bestLinkBetween(data, range, answerRange, filter);
    return linkId === null ? [] : [{ key: spec.key, passage, range, answer, answerRange, linkId }];
  });
}

/**
 * The finale's chain. A search over the whole graph, so it is left until the tour starts rather
 * than made on every change of filter.
 */
export function planFinale(data: TourData, filter: LinkFilter): PathStep[] | null {
  const { versification } = data;
  const steps = findConnectionPath(
    data.index,
    passageRange(tourPassage(TOUR_FINALE.from, versification), versification),
    passageRange(tourPassage(TOUR_FINALE.to, versification), versification),
    filter,
    data.verseGenres,
  );
  return steps !== null && steps.length > 1 ? steps : null;
}

export function planTour(data: TourData, filter: LinkFilter): TourPlan {
  return { stops: planStops(data, filter), finale: planFinale(data, filter) };
}

/** A passage the tour names. Every one is in the KJV numbering, the only one the app uses. */
function tourPassage(id: string, versification: Versification): Passage {
  const passage = parsePassageOsisId(id, versification);
  if (!passage) {
    throw new RangeError(`The tour names a passage the versification lacks: ${id}`);
  }
  return passage;
}

/** The most-voted link joining a verse of `range` and one of `other`, either way; first on a tie. */
function bestLinkBetween(
  data: TourData,
  range: VerseIndexRange,
  other: VerseIndexRange,
  filter: LinkFilter,
): number | null {
  const { outgoing, incoming } = collectConnections(data.index, range, filter, data.verseGenres);
  let best: { readonly id: number; readonly votes: number } | null = null;
  for (const { link, otherStart, otherEnd } of [...outgoing, ...incoming]) {
    const joins = otherStart <= other.end && otherEnd >= other.start;
    if (joins && (best === null || link.votes > best.votes)) {
      best = { id: link.id, votes: link.votes };
    }
  }
  return best?.id ?? null;
}
