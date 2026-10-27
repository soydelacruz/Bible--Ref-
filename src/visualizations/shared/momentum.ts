/**
 * What a view does after a drag lets go: a flick coasts and slows down, and a view pulled past an
 * end resists while held, then springs back. Positions are in pixels along one axis and times in
 * ms; every step is solved exactly rather than integrated, so it moves the same at any frame rate.
 */

/** A coast's speed falls to 1/e every this many ms: about iOS's scroll deceleration. */
export const COAST_TIME_CONSTANT_MS = 325;
/**
 * How quickly the spring draws an overshoot back (its natural frequency, per ms). It is critically
 * damped, so it settles in about 350ms and never swings past the end.
 */
export const SPRING_RATE = 0.018;
/** How hard the band pulls: iOS's constant. */
const RUBBER_BAND_STIFFNESS = 0.55;
/** Slower than this, in px/ms (a pixel every few frames), a glide has stopped. */
const REST_SPEED = 0.02;
/** Within this many px of an end, an overshoot has settled onto it. */
const REST_DISTANCE = 0.5;

/**
 * How far a view pulled `overshoot` px past an end shows past it: about half of a small pull, as
 * on iOS, ever less of a longer one, and never `limit` (a screen's length) or more.
 */
export function rubberBand(overshoot: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }
  const shown = (1 - 1 / ((Math.abs(overshoot) * RUBBER_BAND_STIFFNESS) / limit + 1)) * limit;
  return Math.sign(overshoot) * shown;
}

/** A position gliding along one axis, between two ends. */
export interface Glide {
  /** px; outside `[min, max]` while it overshoots an end. */
  readonly position: number;
  /** px/ms. */
  readonly velocity: number;
}

/**
 * The glide `elapsedMs` later. Between the ends it coasts, slowing down; past one, a spring draws
 * it back. A glide heading back from past an end carries on coasting once it is back in.
 */
export function stepGlide(glide: Glide, elapsedMs: number, min: number, max: number): Glide {
  const { position, velocity } = glide;
  const end = position < min ? min : position > max ? max : null;
  if (end === null) {
    const decay = Math.exp(-elapsedMs / COAST_TIME_CONSTANT_MS);
    return {
      position: position + velocity * COAST_TIME_CONSTANT_MS * (1 - decay),
      velocity: velocity * decay,
    };
  }
  // A critically damped spring: x(t) = (x₀ + (v₀ + ωx₀)t)·e^(−ωt).
  const offset = position - end;
  const decay = Math.exp(-SPRING_RATE * elapsedMs);
  const pull = velocity + SPRING_RATE * offset;
  return {
    position: end + (offset + pull * elapsedMs) * decay,
    velocity: (velocity - SPRING_RATE * pull * elapsedMs) * decay,
  };
}

/** Whether a glide has come to rest: barely moving, and on or between the ends. */
export function isAtRest(glide: Glide, min: number, max: number): boolean {
  const past = glide.position < min ? min - glide.position : glide.position - max;
  return Math.abs(glide.velocity) < REST_SPEED && past < REST_DISTANCE;
}
