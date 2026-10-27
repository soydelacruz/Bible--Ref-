import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { Passage } from '../../../core/bible/passage.ts';
import type { VerseIndexRange } from '../../../core/bible/versification.ts';
import { ARCS_TOUR_PREFERENCE } from '../../../shared/lib/preference-keys.ts';
import { useBooleanPreference } from '../../../shared/lib/preferences.ts';
import type { PathStep } from '../../shared/connection-path.ts';
import { prefersReducedMotion } from '../../shared/frames.ts';
import type { LinkFilter } from '../../shared/link-filter.ts';
import type { VizCore } from '../../shared/viz-data.ts';
import { buildArcInstances } from '../arc-instances.ts';
import { computeArcLayout } from '../arc-layout.ts';
import type { ArcPreview } from '../arcs-controller.ts';
import type { AxisView } from '../axis-view.ts';
import { clearStart } from './tour-framing.ts';
import { planFinale, planStops, type TourData, type TourPlan } from './tour-plan.ts';
import { TourPlayer, tourBeats, type TourBeat, type TourStage } from './tour-player.ts';

/** What the tour needs of the arcs' controller; `ArcsController` has all of it. */
export interface TourCamera {
  showStop(range: VerseIndexRange, view: AxisView): Promise<boolean>;
  setFocus(range: VerseIndexRange | null): void;
  setPreview(preview: ArcPreview | null): void;
  snapshot<T>(compose: (layers: readonly HTMLCanvasElement[]) => T): T;
}

/** Draws a chain of cross-references as travelling light; see `TourStage.playPath`. */
export type PlayPath = (steps: readonly PathStep[], signal: AbortSignal) => Promise<unknown>;

interface ArcsTourOptions {
  readonly data: VizCore;
  readonly filter: LinkFilter;
  readonly active: boolean;
  readonly passage: Passage | null;
  readonly onNavigate: (passage: Passage | null) => void;
  readonly camera: RefObject<TourCamera | null>;
  readonly playPath?: PlayPath | undefined;
}

/** A tour under way. */
export interface TourRun {
  readonly plan: TourPlan;
  readonly beats: readonly TourBeat[];
  /** The card on screen; `null` until the first stop is shown. */
  readonly card: number | null;
  /** Paused by the reader (the page put away pauses it too, without saying so). */
  readonly paused: boolean;
}

export interface ArcsTour {
  /** There is a tour to take: the filter shows at least one of its stops. */
  readonly available: boolean;
  /** A first visit, with nothing open: the tour is offered. */
  readonly inviting: boolean;
  readonly run: TourRun | null;
  readonly start: () => void;
  /** Declines the invitation, for good. */
  readonly dismiss: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Ends the tour, leaving the reader at the passage it was showing. */
  readonly close: () => void;
  /**
   * For what the stage chooses itself (a tap, or Escape): a press that ends the tour hands its
   * stop back when it is over, unless it chose a passage of its own.
   */
  readonly select: (passage: Passage | null) => void;
  /**
   * The layer over the stage that the tour draws in, the card on it (the invitation or the
   * tour's own: never both), and the picture a cut crossfades from.
   */
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly cardRef: RefObject<HTMLElement | null>;
  readonly fadeRef: RefObject<HTMLCanvasElement | null>;
}

/** With reduced motion, how long the picture before a cut takes to fade from over the new one. */
const CROSSFADE_MS = 200;
/** The app's ease-out for things that respond (see `easeOutCubic`), as CSS. */
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Keys that do nothing to the arcs: pressing one on the stage leaves the tour playing. */
const PASSIVE_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab']);

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
  };
}

/**
 * The arcs' guided tour: what it shows, where it is, and how the reader steers it.
 *
 * It plays on an empty focus. Starting closes any passage that is open; the tour then focuses
 * its stops on the stage itself, without going through the address, so Back and the panel stay
 * as they were. When it ends, the passage it was showing is handed to the app like any other, so
 * the reader is left there with everything working: the panel, the address, Back.
 *
 * Anything the reader does to the arcs ends it: a press, the wheel, a key on the stage, or
 * Escape anywhere. So does going somewhere else (a search, Wander, Back) or changing the filter.
 * Putting the page or the view away only pauses it, and it carries on when they come back.
 */
export function useArcsTour({
  data,
  filter,
  active,
  passage,
  onNavigate,
  camera,
  playPath,
}: ArcsTourOptions): ArcsTour {
  const tourData = useMemo<TourData>(
    () => ({
      versification: data.versification,
      index: data.crossReferences.index,
      verseGenres: data.verseGenres,
    }),
    [data.versification, data.crossReferences.index, data.verseGenres],
  );
  const available = useMemo(() => planStops(tourData, filter).length > 0, [tourData, filter]);
  const [offered, setOffered] = useBooleanPreference(ARCS_TOUR_PREFERENCE, false);
  const [run, setRun] = useState<TourRun | null>(null);
  const hidden = useSyncExternalStore(
    subscribeToVisibility,
    () => document.hidden,
    () => false,
  );
  const playing = useRef<{ readonly player: TourPlayer; readonly abort: AbortController } | null>(
    null,
  );
  /** The passage the tour last focused: where the reader is left when it ends. */
  const shown = useRef<Passage | null>(null);
  /** A press on the stage ended the tour: the stop to hand back once it is over. */
  const pending = useRef<Passage | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLCanvasElement>(null);
  const touring = run !== null;
  const inviting = !offered && available && active && passage === null && !touring;

  /**
   * Stops the tour where it is, and returns the passage it was showing. A chain the path light
   * drew stays on the picture, with the reader, until the focus moves off it.
   */
  const halt = (): Passage | null => {
    const current = playing.current;
    playing.current = null;
    current?.player.stop();
    camera.current?.setPreview(null);
    // Focus on the card's buttons would be lost with them: it goes to the arcs, where the reader is.
    if (cardRef.current?.contains(document.activeElement)) {
      layerRef.current?.parentElement
        ?.querySelector<HTMLElement>('[role="application"]')
        ?.focus({ preventScroll: true });
    }
    const last = shown.current;
    shown.current = null;
    setRun(null);
    return last;
  };

  /** Ends the tour, handing its passage to the app (or leaving nothing focused, if none yet). */
  const end = () => {
    const last = halt();
    if (last) {
      onNavigate(last);
    } else {
      camera.current?.setFocus(null);
    }
  };
  const finish = useEffectEvent(end);

  // Plays once there is nothing else focused, so the app's own focus never lands on the tour's.
  const begin = useEffectEvent(() => {
    const stageCamera = camera.current;
    if (run === null || playing.current !== null || passage !== null || !active || !stageCamera) {
      return;
    }
    const abort = new AbortController();
    const elements = { layerRef, cardRef, fadeRef };
    const stage = tourStage(stageCamera, tourData, elements, abort.signal, playPath);
    const player = new TourPlayer(run.beats, stage, {
      onBeat: (beat) => {
        shown.current = beat.passage;
        setRun((current) => current && { ...current, card: beat.card });
      },
      onEnd: () => {
        finish();
      },
    });
    playing.current = { player, abort };
    player.start();
  });
  useEffect(() => {
    begin();
  }, [run, passage, active]);

  // The reader went somewhere: that passage wins, and the tour gives up its own.
  const leave = useEffectEvent(() => {
    if (touring && passage !== null && playing.current !== null) {
      halt();
    }
  });
  useEffect(() => {
    leave();
  }, [passage]);

  // Different links: the stops were chosen under the old filter.
  const refilter = useEffectEvent(() => {
    if (playing.current !== null) {
      finish();
    }
  });
  useEffect(() => {
    refilter();
  }, [filter]);

  // Out of sight, nothing moves on: the clock stops, and starts again on return.
  const paused = run?.paused === true || !active || hidden;
  useEffect(() => {
    const player = playing.current?.player;
    if (paused) {
      player?.pause();
    } else {
      player?.resume();
    }
  }, [paused, run]);

  const pressed = useEffectEvent(() => {
    pending.current = shown.current;
    halt();
    const settle = () => {
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
      const last = pending.current;
      pending.current = null;
      if (last) {
        onNavigate(last);
      }
    };
    window.addEventListener('pointerup', settle);
    window.addEventListener('pointercancel', settle);
  });

  useEffect(() => {
    const area = layerRef.current?.parentElement;
    if (!touring || !area) {
      return undefined;
    }
    const inCard = (target: EventTarget | null) =>
      target instanceof Node && cardRef.current?.contains(target) === true;
    // A press hands the stop back when it is over: the panel opening mid-drag would pull the
    // arcs out from under the finger.
    const onPress = (event: Event) => {
      if (!inCard(event.target)) {
        pressed();
      }
    };
    const onWheel = (event: Event) => {
      if (!inCard(event.target)) {
        finish();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only the tour: the stage's own Escape would clear the passage it hands back.
        event.preventDefault();
        event.stopPropagation();
        finish();
      } else if (
        event.target instanceof Node &&
        area.contains(event.target) &&
        !inCard(event.target) &&
        !PASSIVE_KEYS.has(event.key)
      ) {
        finish();
      }
    };
    area.addEventListener('pointerdown', onPress, { capture: true });
    area.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      area.removeEventListener('pointerdown', onPress, { capture: true });
      area.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [touring]);

  // A first visit's invitation goes away for good once the reader starts on the arcs alone.
  const explored = useEffectEvent(() => {
    setOffered(true);
  });
  useEffect(() => {
    const area = layerRef.current?.parentElement;
    if (!inviting || !area) {
      return undefined;
    }
    const onUse = (event: Event) => {
      const inCard = event.target instanceof Node && cardRef.current?.contains(event.target);
      // Tabbing past the stage on the way to the invitation is not using the arcs.
      const passive = event instanceof KeyboardEvent && PASSIVE_KEYS.has(event.key);
      if (inCard !== true && !passive) {
        explored();
      }
    };
    area.addEventListener('pointerdown', onUse, { capture: true });
    area.addEventListener('wheel', onUse, { capture: true, passive: true });
    area.addEventListener('keydown', onUse, { capture: true });
    return () => {
      area.removeEventListener('pointerdown', onUse, { capture: true });
      area.removeEventListener('wheel', onUse, { capture: true });
      area.removeEventListener('keydown', onUse, { capture: true });
    };
  }, [inviting]);

  useEffect(
    () => () => {
      playing.current?.player.stop();
      playing.current?.abort.abort();
      playing.current = null;
    },
    [],
  );

  return {
    available,
    inviting,
    run,
    start: () => {
      if (touring || !available) {
        return;
      }
      setOffered(true);
      const plan = { stops: planStops(tourData, filter), finale: planFinale(tourData, filter) };
      const beats = tourBeats(plan, {
        total: tourData.versification.verseCount,
        reducedMotion: prefersReducedMotion(),
        playsPath: playPath !== undefined,
      });
      setRun({ plan, beats, card: null, paused: false });
      if (passage !== null) {
        onNavigate(null);
      }
    },
    dismiss: () => {
      setOffered(true);
    },
    pause: () => {
      setRun((current) => current && { ...current, paused: true });
    },
    resume: () => {
      setRun((current) => current && { ...current, paused: false });
    },
    close: end,
    select: (chosen) => {
      pending.current = null;
      onNavigate(chosen);
    },
    layerRef,
    cardRef,
    fadeRef,
  };
}

/** The tour's own elements over the stage (see `ArcsTour`). */
interface TourElements {
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly cardRef: RefObject<HTMLElement | null>;
  readonly fadeRef: RefObject<HTMLCanvasElement | null>;
}

/** Room left between the card and the first passage it frames, in px. */
const CARD_CLEARANCE_PX = 12;
/** The card never takes more of the axis than this, however short the screen. */
const MAX_COVERED_SHARE = 0.4;

/**
 * How much of the axis's start the card covers. On an upright phone the axis runs down the left
 * and the card lies across the top of it; elsewhere it sits clear of the axis, and covers none.
 */
export function coveredShare(layer: HTMLElement | null, card: HTMLElement | null): number {
  if (!layer || !card) {
    return 0;
  }
  const layout = computeArcLayout(layer.clientWidth, layer.clientHeight);
  const length = layout.axisEnd - layout.axisStart;
  if (layout.orientation !== 'vertical' || length <= 0) {
    return 0;
  }
  const below =
    card.getBoundingClientRect().bottom - layer.getBoundingClientRect().top + CARD_CLEARANCE_PX;
  return Math.min(Math.max((below - layout.axisStart) / length, 0), MAX_COVERED_SHARE);
}

/** The stage the tour plays on: the arcs' controller, and the picture a cut fades from. */
export function tourStage(
  camera: TourCamera,
  data: TourData,
  { layerRef, cardRef, fadeRef }: TourElements,
  signal: AbortSignal,
  playPath?: PlayPath,
): TourStage {
  const total = data.versification.verseCount;
  return {
    // Framed clear of the card, measured as each shot starts: a phone may have turned since.
    show: (range, view) =>
      camera.showStop(
        range,
        clearStart(view, coveredShare(layerRef.current, cardRef.current), total),
      ),
    point: (pointer) => {
      camera.setPreview(
        pointer && {
          links: buildArcInstances(data.index, Int32Array.from(pointer.linkIds), data.verseGenres),
          passage: pointer.passage,
        },
      );
    },
    crossfade: () => {
      const canvas = fadeRef.current;
      if (canvas) {
        crossfadeFrom(canvas, camera);
      }
    },
    playPath: playPath && ((steps) => playPath(steps, signal)),
  };
}

/**
 * Lays the picture as it is over the stage and fades it out, so the cut under it reads as a
 * crossfade. Opacity only, and over in a moment: the change still shows with reduced motion,
 * but nothing travels.
 */
function crossfadeFrom(canvas: HTMLCanvasElement, camera: TourCamera): void {
  camera.snapshot((layers) => {
    const context = canvas.getContext('2d');
    const [base] = layers;
    if (!context || !base) {
      return;
    }
    canvas.width = base.width;
    canvas.height = base.height;
    for (const layer of layers) {
      context.drawImage(layer, 0, 0);
    }
  });
  canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: CROSSFADE_MS,
    easing: EASE_OUT,
    fill: 'forwards',
  });
}
