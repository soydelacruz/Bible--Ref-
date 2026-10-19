import { parsePassageOsisId, type Passage } from '../../core/bible/passage.ts';
import type { Versification } from '../../core/bible/versification.ts';

/**
 * The guided tour's stops: verses that many readers know, chosen so that their links reach across
 * the whole Bible — creation, the promise in Eden, the shepherd, the suffering servant, the new
 * covenant, the gospel in one verse, the Spirit poured out, and the end that answers the beginning.
 */
export const TOUR_STOPS = [
  'Gen.1.1',
  'Gen.3.15',
  'Ps.23.1',
  'Isa.53.5',
  'Jer.31.33',
  'John.3.16',
  'Acts.2.17',
  'Rev.22.13',
] as const;

/** How long the tour stays at each stop: time to read the verse and see where it reaches. */
export const TOUR_STEP_MS = 7000;

/** The tour's stops as passages of the versification (a stop it does not have is skipped). */
export function tourPassages(versification: Versification): Passage[] {
  return TOUR_STOPS.flatMap((id) => parsePassageOsisId(id, versification) ?? []);
}

/**
 * Plays `stops` one after another: the first at once, then one every `stepMs`, and `onEnd` after
 * the last has been shown for its time. Returns a function that stops the tour early (`onEnd` is
 * then not called).
 */
export function playTour<Stop>(
  stops: readonly Stop[],
  onStep: (stop: Stop, index: number) => void,
  onEnd: () => void,
  stepMs: number = TOUR_STEP_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const show = (index: number) => {
    const stop = stops[index];
    if (stop === undefined) {
      timer = null;
      onEnd();
      return;
    }
    onStep(stop, index);
    timer = setTimeout(() => {
      show(index + 1);
    }, stepMs);
  };
  show(0);
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
