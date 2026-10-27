import { versePassage, type Passage } from '../../../core/bible/passage.ts';
import type { VerseIndexRange } from '../../../core/bible/versification.ts';
import type { PathStep } from '../../shared/connection-path.ts';
import type { AxisView } from '../axis-view.ts';
import { closeUpView, framingView } from './tour-framing.ts';
import type { TourPlan, TourStop } from './tour-plan.ts';

/** Links picked out over the focus, and the passage they lead to, marked on the axis. */
export interface TourPointer {
  readonly linkIds: readonly number[];
  readonly passage: VerseIndexRange;
}

/** What the tour asks of the arcs. */
export interface TourStage {
  /**
   * Focuses `range` and flies to `view`, its links growing out of it as the camera lands (cutting
   * straight there with reduced motion). Resolves once it has landed.
   */
  show(range: VerseIndexRange, view: AxisView): Promise<unknown>;
  point(pointer: TourPointer | null): void;
  /** With reduced motion: holds the picture as it is, for the next one to crossfade in over. */
  crossfade(): void;
  /**
   * The path light: draws a chain of cross-references as light travelling along it, resolving
   * once it has. Without it, the finale lights the chain one step at a time.
   */
  readonly playPath?: ((steps: readonly PathStep[]) => Promise<unknown>) | undefined;
}

/** One shot of the tour: what the stage does, and how long the picture then holds. */
export interface TourBeat {
  /** The card on screen: the stop's place in the tour, with the finale last. */
  readonly card: number;
  /** What is focused once it has played: where the reader is left if the tour ends there. */
  readonly passage: Passage;
  readonly act: (stage: TourStage) => Promise<unknown>;
  /** In ms, from when the camera lands. */
  readonly holdMs: number;
}

/**
 * How long each shot holds once the camera has landed. A stop is two shots: up close, long enough
 * to see its links leave; then both ends in sight, long enough to read the card. About 6.5s a stop
 * with the flights, and 45s for the whole tour.
 */
export const HOLD_MS = {
  closeUp: 1400,
  reach: 3800,
  /** The finale: its first verse up close, each link of the chain, and the whole chain at the end. */
  pathStart: 1200,
  pathStep: 1500,
  pathEnd: 3200,
} as const;

/**
 * With reduced motion a stop is one picture, cut to rather than flown to: with no flights to
 * watch, each card stays a little longer than the two shots it replaces.
 */
export const STILL_HOLD_MS = {
  stop: 7000,
  pathStart: 1600,
  pathStep: 2200,
  pathEnd: 4000,
} as const;

interface BeatOptions {
  readonly total: number;
  readonly reducedMotion: boolean;
  /** The stage can draw the path light (see `TourStage.playPath`). */
  readonly playsPath: boolean;
}

/** The tour's shots, in order: each stop, then the finale (whose card comes last). */
export function tourBeats(plan: TourPlan, options: BeatOptions): TourBeat[] {
  const beats = plan.stops.flatMap((stop, card) => stopBeats(stop, card, options));
  return plan.finale === null
    ? beats
    : [...beats, ...finaleBeats(plan.finale, plan.stops.length, options)];
}

function stopBeats(stop: TourStop, card: number, options: BeatOptions): TourBeat[] {
  const { range, passage } = stop;
  const reach = framingView([range, stop.answerRange], options.total);
  const pointer = { linkIds: [stop.linkId], passage: stop.answerRange };
  if (options.reducedMotion) {
    return [
      {
        card,
        passage,
        holdMs: STILL_HOLD_MS.stop,
        act: (stage) => {
          stage.crossfade();
          stage.point(pointer);
          return stage.show(range, reach);
        },
      },
    ];
  }
  return [
    {
      card,
      passage,
      holdMs: HOLD_MS.closeUp,
      act: (stage) => {
        stage.point(null);
        return stage.show(range, closeUpView(range, options.total));
      },
    },
    {
      card,
      passage,
      holdMs: HOLD_MS.reach,
      act: (stage) => {
        stage.point(pointer);
        return stage.show(range, reach);
      },
    },
  ];
}

const rangeOf = (step: PathStep): VerseIndexRange => ({ start: step.verse, end: step.verse });

/**
 * The finale: up close on the chain's first verse, then a link at a time, the camera framing
 * each one as the focus moves along and the links walked so far stay picked out; last, the whole
 * chain in sight. With the path light, its first verse and then the light along the chain.
 */
function finaleBeats(steps: readonly PathStep[], card: number, options: BeatOptions): TourBeat[] {
  const { total, reducedMotion } = options;
  const holds = reducedMotion ? STILL_HOLD_MS : HOLD_MS;
  const first = rangeOf(steps[0] ?? { verse: 0, hop: null });
  const last = steps.at(-1) ?? { verse: first.start, hop: null };
  const whole = framingView(steps.map(rangeOf), total);
  const cut = (stage: TourStage) => {
    if (reducedMotion) {
      stage.crossfade();
    }
  };
  if (options.playsPath) {
    return [
      {
        card,
        passage: versePassage(first.start),
        holdMs: holds.pathEnd,
        act: async (stage) => {
          cut(stage);
          stage.point(null);
          await stage.show(first, whole);
          await stage.playPath?.(steps);
        },
      },
    ];
  }
  const hops = steps.flatMap((step) => (step.hop === null ? [] : [step.hop.linkId]));
  const opening: TourBeat = {
    card,
    passage: versePassage(first.start),
    holdMs: holds.pathStart,
    act: (stage) => {
      cut(stage);
      stage.point(null);
      return stage.show(first, closeUpView(first, total));
    },
  };
  const walk = steps.slice(1).map((step, hop): TourBeat => ({
    card,
    passage: versePassage(step.verse),
    holdMs: holds.pathStep,
    act: (stage) => {
      cut(stage);
      stage.point({ linkIds: hops.slice(0, hop + 1), passage: rangeOf(step) });
      const from = steps[hop] ?? step;
      return stage.show(rangeOf(step), framingView([rangeOf(from), rangeOf(step)], total));
    },
  }));
  const ending: TourBeat = {
    card,
    passage: versePassage(last.verse),
    holdMs: holds.pathEnd,
    act: (stage) => {
      cut(stage);
      stage.point({ linkIds: hops, passage: rangeOf(last) });
      return stage.show(rangeOf(last), whole);
    },
  };
  return [opening, ...walk, ending];
}

export interface TourPlayerEvents {
  /** A beat begins; its card is the one to show. */
  readonly onBeat: (beat: TourBeat, index: number) => void;
  /** The last beat has held for its time. */
  readonly onEnd: () => void;
}

/**
 * Plays beats one after another: each acts on the stage and, once its camera has landed, holds
 * for its time before the next. Pausing stops the clock of the hold under way — a flight already
 * under way still lands, and nothing starts until the tour resumes. Stopping drops the rest.
 *
 * Nothing here draws or runs on a frame loop: a hold is one timer, and the stage draws only
 * while its camera moves.
 */
export class TourPlayer {
  readonly #beats: readonly TourBeat[];
  readonly #stage: TourStage;
  readonly #events: TourPlayerEvents;
  #index = -1;
  #paused = false;
  #stopped = false;
  /** A beat is acting (its camera still on the way): there is no hold to pause yet. */
  #acting = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #holdStartedAt = 0;
  #holdLeft = 0;

  constructor(beats: readonly TourBeat[], stage: TourStage, events: TourPlayerEvents) {
    this.#beats = beats;
    this.#stage = stage;
    this.#events = events;
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** Plays the first beat; once only. */
  start(): void {
    if (this.#index < 0 && !this.#stopped) {
      void this.#play(0);
    }
  }

  pause(): void {
    if (this.#paused || this.#stopped) {
      return;
    }
    this.#paused = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#holdLeft -= performance.now() - this.#holdStartedAt;
    }
  }

  resume(): void {
    if (!this.#paused || this.#stopped) {
      return;
    }
    this.#paused = false;
    if (!this.#acting && this.#index >= 0) {
      this.#hold();
    }
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  async #play(index: number): Promise<void> {
    this.#index = index;
    const beat = this.#beats[index];
    if (beat === undefined) {
      this.#stopped = true;
      this.#events.onEnd();
      return;
    }
    this.#events.onBeat(beat, index);
    this.#acting = true;
    await beat.act(this.#stage);
    this.#acting = false;
    if (this.#stopped) {
      return;
    }
    this.#holdLeft = beat.holdMs;
    if (!this.#paused) {
      this.#hold();
    }
  }

  #hold(): void {
    this.#holdStartedAt = performance.now();
    this.#timer = setTimeout(
      () => {
        this.#timer = null;
        void this.#play(this.#index + 1);
      },
      Math.max(this.#holdLeft, 0),
    );
  }
}
