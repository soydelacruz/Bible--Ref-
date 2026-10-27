/** Largest device pixel ratio rendered; higher ratios cost fill rate for no visible gain. */
export const MAX_PIXEL_RATIO = 2;

/**
 * Coalesces render requests into at most one frame, so the scene is drawn only when something
 * changed (no continuous render loop draining phone batteries).
 */
export class FrameScheduler {
  readonly #render: () => void;
  #frame: number | null = null;

  constructor(render: () => void) {
    this.#render = render;
  }

  request(): void {
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null;
      this.#render();
    });
  }

  dispose(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  }
}

/** The app's easing for things that respond to the reader: quick to start, gentle to land. */
export function easeOutCubic(linear: number): number {
  return 1 - (1 - linear) ** 3;
}

/** For things already on screen that travel: they start and land gently. */
export function easeInOutCubic(linear: number): number {
  return linear < 0.5 ? 4 * linear ** 3 : 1 - (-2 * linear + 2) ** 3 / 2;
}

/**
 * Runs `onFrame(progress)` over `durationMs`, eased (ease-out unless told otherwise); returns a
 * cancel function.
 */
export function animate(
  durationMs: number,
  onFrame: (progress: number) => void,
  ease: (linear: number) => number = easeOutCubic,
): () => void {
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const linear = Math.min((now - start) / durationMs, 1);
    onFrame(ease(linear));
    if (linear < 1) {
      frame = requestAnimationFrame(step);
    }
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}

/**
 * The longest step `simulate` hands over: after a stalled frame (or a tab coming back), motion
 * resumes where it was instead of jumping.
 */
export const MAX_FRAME_MS = 50;

/**
 * Calls `step(elapsedMs)` every frame, with the time since the previous call, until it returns
 * `false`: for motion with no fixed duration, such as a coast slowing down. Returns a cancel
 * function.
 */
export function simulate(step: (elapsedMs: number) => boolean): () => void {
  let last = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    const elapsed = Math.min(Math.max(now - last, 0), MAX_FRAME_MS);
    last = now;
    if (step(elapsed)) {
      frame = requestAnimationFrame(tick);
    }
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}

/** Whether the reader asked for less motion; read each time, since it can change at any moment. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
