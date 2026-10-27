import type { AxisView } from './axis-view.ts';

/**
 * Camera flights along the verse axis, after van Wijk and Nuij, "Smooth and efficient zooming and
 * panning" (2003). The path that looks shortest pulls back until both ends are in sight, travels,
 * and dives in: a jump from Genesis to Revelation passes over the whole canon, while a move to a
 * neighbouring chapter barely zooms. It is the path d3's `interpolateZoom` takes, here for a
 * single axis: a view's center and width.
 */

/** How much the path prefers zooming out to panning; √2 is what the paper's viewers liked best. */
const RHO = Math.SQRT2;
const RHO2 = 2;
const RHO4 = 4;
/** Centers closer than this, in verses, are one: the flight is a pure zoom. */
const SAME_CENTER = 1e-6;

/** Flights are never quicker than this, in ms, so even a short one reads as a move. */
export const FLIGHT_MIN_MS = 300;
/** Nor slower than this, so the farthest jump never holds the reader up. */
export const FLIGHT_MAX_MS = 900;
/**
 * Flight time grows with the square root of the path's length: longer flights cover more of it
 * per millisecond, as a camera speeds up on a long journey.
 */
const FLIGHT_MS_PER_ROOT_LENGTH = 330;

export interface Flight {
  /** The view `progress` of the way along (0: where it starts; 1: exactly where it ends). */
  readonly at: (progress: number) => AxisView;
  /**
   * The path's length in the paper's units, which measure how far it looks rather than how many
   * verses it covers: one is about a doubling of the width, or a pan by a screen and a half.
   */
  readonly length: number;
}

function viewAround(center: number, width: number): AxisView {
  return { start: center - width / 2, end: center + width / 2 };
}

/**
 * The smooth zoom-and-pan path from one view to another. Its width never dips below the narrower
 * of the two, so a flight never zooms in further than where it lands.
 */
export function planFlight(from: AxisView, to: AxisView): Flight {
  const center0 = (from.start + from.end) / 2;
  const center1 = (to.start + to.end) / 2;
  const width0 = from.end - from.start;
  const width1 = to.end - to.start;
  const shift = center1 - center0;
  const distance = Math.abs(shift);

  if (distance < SAME_CENTER) {
    const zoom = Math.log(width1 / width0);
    return {
      length: Math.abs(zoom) / RHO,
      at: (progress) =>
        progress >= 1
          ? to
          : viewAround(center0 + progress * shift, width0 * Math.exp(zoom * progress)),
    };
  }

  const b0 = (width1 ** 2 - width0 ** 2 + RHO4 * distance ** 2) / (2 * width0 * RHO2 * distance);
  const b1 = (width1 ** 2 - width0 ** 2 - RHO4 * distance ** 2) / (2 * width1 * RHO2 * distance);
  const r0 = Math.log(Math.sqrt(b0 ** 2 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 ** 2 + 1) - b1);
  const length = (r1 - r0) / RHO;
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  return {
    length,
    at: (progress) => {
      if (progress >= 1) {
        return to;
      }
      const angle = RHO * progress * length + r0;
      const share = (width0 / (RHO2 * distance)) * (coshR0 * Math.tanh(angle) - sinhR0);
      return viewAround(center0 + share * shift, (width0 * coshR0) / Math.cosh(angle));
    },
  };
}

/** How long a flight of `length` (see `Flight`) takes, in ms. */
export function flightDuration(length: number): number {
  return Math.min(
    Math.max(FLIGHT_MS_PER_ROOT_LENGTH * Math.sqrt(length), FLIGHT_MIN_MS),
    FLIGHT_MAX_MS,
  );
}
