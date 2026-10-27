import type { PathStep } from './connection-path.ts';
import { MAX_FRAME_MS, prefersReducedMotion } from './frames.ts';
import { flightFrame, flightSettles, travelLandingIn, type FlightFrame } from './loading-arcs.ts';

/**
 * A chain of cross-references drawn on a visualization as the loading screen's light, travelling
 * hop by hop from the passage to the one the reader asked for, while the details panel lights up
 * each step as the light reaches it. Here are the timing both views share and the link between the
 * panel and the view beside it; each view paints the light along its own links.
 */

/** Time between one hop's light setting off and the next one's, in ms: each sets off as the last lands. */
export const HOP_MS = 250;
const HOP_TRAVEL_MS = travelLandingIn(HOP_MS);

/** A hop once its light has passed: its trace stays, so that the chain can be read. */
export const RESTING_HOP: FlightFrame = { head: 1, tail: 1, light: 0, trace: 1, landing: 0 };

/** The light of the `hop`th hop (from 0), `elapsed` ms into the path; `null` before it sets off. */
export function hopFrame(hop: number, elapsed: number): FlightFrame | null {
  const flight = { launchedAt: hop * HOP_MS, travel: HOP_TRAVEL_MS };
  if (elapsed < flight.launchedAt) {
    return null;
  }
  const frame = flightFrame(flight, elapsed);
  return frame ? { ...frame, trace: 1 } : RESTING_HOP;
}

/** How long a path of `hops` hops plays: until the last one has landed and its flash has faded. */
export function pathDuration(hops: number): number {
  return hops > 0 ? (hops - 1) * HOP_MS + flightSettles({ travel: HOP_TRAVEL_MS }) : 0;
}

/** Steps of a chain that are lit, by position (0: the passage it starts from), both ends included. */
export interface LitSteps {
  readonly first: number;
  readonly last: number;
}

/** The step lit `elapsed` ms into a path: the one the light is heading for, while its hop travels. */
export function litStepAt(hops: number, elapsed: number): LitSteps | null {
  if (elapsed < 0 || elapsed >= hops * HOP_MS) {
    return null;
  }
  const step = Math.floor(elapsed / HOP_MS) + 1;
  return { first: step, last: step };
}

export function isLit(lit: LitSteps | null, step: number): boolean {
  return lit !== null && step >= lit.first && step <= lit.last;
}

/**
 * How a path plays: its light travels; or, for a reader who asked for less motion, the whole chain
 * is drawn at once and every step lit together, for as long as the light would have taken; or, out
 * of sight, it is drawn at once and is done.
 */
export type PathMode = 'travel' | 'still' | 'instant';

export function pathMode(active: boolean): PathMode {
  if (!active) {
    return 'instant';
  }
  return prefersReducedMotion() ? 'still' : 'travel';
}

export interface PathPlayOptions {
  /** Aborting it stops the path at once, wherever it is, and takes it off the picture. */
  readonly signal?: AbortSignal;
  /** Told which steps the light is at as it reaches them, and `null` once it has passed them all. */
  readonly onLit?: (lit: LitSteps | null) => void;
}

/** Each frame's light, one per hop: `null` for a hop whose light has not set off yet. */
export type PathFrames = readonly (FlightFrame | null)[];

/**
 * One play of a path of `hops` hops: `paint` is handed every hop's light each frame, from the first
 * setting off until the last has landed (one frame only, unless it travels). `done` resolves `true`
 * once it has played, `false` if it was cancelled first. Timed by the frames, each counted for at
 * most `MAX_FRAME_MS`, so that a stalled frame never skips a hop the panel was about to light.
 */
export class PathRun {
  readonly done: Promise<boolean>;
  readonly #hops: number;
  readonly #paint: (frames: PathFrames) => void;
  readonly #onLit: ((lit: LitSteps | null) => void) | undefined;
  #elapsed = 0;
  #lit: LitSteps | null = null;
  #frame: number | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #over = false;
  #resolve: (played: boolean) => void = () => undefined;

  constructor(
    hops: number,
    mode: PathMode,
    paint: (frames: PathFrames) => void,
    onLit?: (lit: LitSteps | null) => void,
  ) {
    this.#hops = hops;
    this.#paint = paint;
    this.#onLit = onLit;
    this.done = new Promise((resolve) => {
      this.#resolve = resolve;
    });
    if (mode !== 'travel') {
      this.#elapsed = Infinity;
      paint(this.frames());
      if (mode === 'instant') {
        this.#end(true);
        return;
      }
      this.#light({ first: 0, last: hops });
      this.#timer = setTimeout(() => {
        this.#end(true);
      }, pathDuration(hops));
      return;
    }
    const duration = pathDuration(hops);
    let last = performance.now();
    const step = (now: number) => {
      this.#frame = null;
      this.#elapsed += Math.min(Math.max(now - last, 0), MAX_FRAME_MS);
      last = now;
      paint(this.frames());
      this.#light(litStepAt(hops, this.#elapsed));
      if (this.#elapsed >= duration) {
        this.#end(true);
      } else {
        this.#frame = requestAnimationFrame(step);
      }
    };
    paint(this.frames());
    this.#light(litStepAt(hops, 0));
    this.#frame = requestAnimationFrame(step);
  }

  /** Every hop's light as it is now, to paint again when the picture under it moves. */
  frames(): PathFrames {
    return Array.from({ length: this.#hops }, (_, hop) => hopFrame(hop, this.#elapsed));
  }

  /** Lands at once, with every hop drawn at rest. */
  finish(): void {
    if (this.#over) {
      return;
    }
    this.#elapsed = Infinity;
    this.#paint(this.frames());
    this.#end(true);
  }

  /** Stops where it is; what is drawn is left to the caller. */
  cancel(): void {
    this.#end(false);
  }

  #light(lit: LitSteps | null): void {
    if (lit?.first === this.#lit?.first && lit?.last === this.#lit?.last) {
      return;
    }
    this.#lit = lit;
    this.#onLit?.(lit);
  }

  #end(played: boolean): void {
    if (this.#over) {
      return;
    }
    this.#over = true;
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
    }
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.#light(null);
    this.#resolve(played);
  }
}

/** Draws a chain on a visualization (see `PathLight.attach`). */
export type PathPlayer = (
  steps: readonly PathStep[],
  options: Required<PathPlayOptions>,
) => Promise<boolean>;

function sameChain(a: readonly PathStep[] | null, b: readonly PathStep[] | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.length === b.length &&
      a.every((step, position) => {
        const other = b[position];
        return step.verse === other?.verse && step.hop?.linkId === other.hop?.linkId;
      }))
  );
}

/**
 * Where a view's details panel and its picture meet over a path: the panel shows a chain here, the
 * picture beside it draws it and says which steps its light is at, and the panel lights them. One
 * per view, made where both are, since every view is mounted at once and each has its own panel.
 */
export class PathLight {
  #steps: readonly PathStep[] | null = null;
  #player: PathPlayer | null = null;
  /** The chain drawn now: aborting it takes it off the picture. */
  #run: AbortController | null = null;
  #lit: LitSteps | null = null;
  readonly #listeners = new Set<() => void>();

  /**
   * A chain appears in the panel, or goes (`null`): a new one plays once and takes the place of the
   * one before, at once. The same chain again, worked out anew, plays nothing.
   */
  show(steps: readonly PathStep[] | null): void {
    if (sameChain(steps, this.#steps)) {
      return;
    }
    this.#steps = steps;
    this.#play();
  }

  /** Plays the chain shown again, from its start. */
  replay(): void {
    this.#play();
  }

  /**
   * The picture that draws the chain; a chain shown before it came plays now. Returns a way to let
   * go of it, which takes the chain off the picture.
   */
  attach(player: PathPlayer): () => void {
    this.#player = player;
    this.#play();
    return () => {
      if (this.#player === player) {
        this.#stop();
        this.#player = null;
      }
    };
  }

  /** For `useSyncExternalStore`: called whenever the steps lit change. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** The steps lit now; the same object until they change. */
  readonly lit = (): LitSteps | null => this.#lit;

  #play(): void {
    this.#stop();
    const steps = this.#steps;
    const player = this.#player;
    if (!steps || !player) {
      return;
    }
    const run = new AbortController();
    this.#run = run;
    void player(steps, {
      signal: run.signal,
      onLit: (lit) => {
        if (this.#run === run) {
          this.#light(lit);
        }
      },
    });
  }

  #stop(): void {
    this.#run?.abort();
    this.#run = null;
    this.#light(null);
  }

  #light(lit: LitSteps | null): void {
    if (lit === this.#lit) {
      return;
    }
    this.#lit = lit;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
