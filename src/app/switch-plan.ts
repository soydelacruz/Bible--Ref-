import {
  isInSight,
  nearestInSight,
  type PassageSpot,
  type ScreenPoint,
} from '../visualizations/shared/passage-spot.ts';

/** How long the beacon takes to travel from one view to the other, in ms. */
export const BEACON_MS = 350;
/** The views' crossfade, in ms: the whole switch when no passage travels. */
export const CROSSFADE_MS = 180;
/** From the keyboard a switch only blinks: near-instant, as a key press expects. */
export const KEYBOARD_FADE_MS = 100;
/**
 * How far inside the edge of a view's drawing area the beacon stops when its passage is out of
 * sight there: far enough for the whole glow to show.
 */
export const EDGE_INSET_PX = 20;

/** What a switch between views knows before it starts. */
export interface SwitchContext {
  /** The browser can animate a change of the page (the View Transitions API). */
  readonly canTransition: boolean;
  readonly reducedMotion: boolean;
  /** The reader's latest input was a key: the switch answers at once. */
  readonly keyboard: boolean;
  /** A passage is focused and the switch keeps it, so there is one for the beacon to carry. */
  readonly carriesPassage: boolean;
}

/**
 * How the views change places. With the View Transitions API, the page crossfades, and a beacon
 * may carry the passage across (`planBeacon` says where). Without it, the next view fades in over
 * the last one, and nothing travels.
 */
export type SwitchStyle =
  | { readonly kind: 'transition'; readonly fadeMs: number; readonly beacon: boolean }
  | { readonly kind: 'fade'; readonly fadeMs: number };

export function chooseSwitch({
  canTransition,
  reducedMotion,
  keyboard,
  carriesPassage,
}: SwitchContext): SwitchStyle {
  const fadeMs = keyboard ? KEYBOARD_FADE_MS : CROSSFADE_MS;
  if (!canTransition) {
    return { kind: 'fade', fadeMs };
  }
  // A crossfade only, with less motion or from the keyboard: the feedback stays, the travel goes.
  return { kind: 'transition', fadeMs, beacon: carriesPassage && !keyboard && !reducedMotion };
}

/**
 * Where the beacon goes: from the passage in the last view to the passage in the next one; or,
 * when the last view does not draw the passage at all, it appears where the next one does.
 */
export type BeaconPath =
  | { readonly kind: 'travel'; readonly from: ScreenPoint; readonly to: ScreenPoint }
  | { readonly kind: 'arrive'; readonly to: ScreenPoint }
  | { readonly kind: 'none' };

/** Where the beacon starts, before the next view is shown: `null` for nowhere yet. */
export function beaconStart(from: PassageSpot | null): ScreenPoint | null {
  return from && nearestInSight(from, EDGE_INSET_PX);
}

/**
 * The beacon's path, from where the passage is drawn in the view being left to where it is drawn
 * in the one being shown. Out of sight in one of them, the beacon leaves from, or lands at, the
 * edge of that view nearest the passage — an arrow to where it went, which a beacon fading over
 * whatever happens to be drawn there could never be. In sight in neither, there is nothing to
 * point at; nor when the next view does not draw it at all.
 */
export function planBeacon(from: PassageSpot | null, to: PassageSpot | null): BeaconPath {
  const seenBefore = from !== null && isInSight(from);
  const seenAfter = to !== null && isInSight(to);
  if (!to || !(seenBefore || seenAfter)) {
    return { kind: 'none' };
  }
  const landing = nearestInSight(to, EDGE_INSET_PX);
  return from
    ? { kind: 'travel', from: nearestInSight(from, EDGE_INSET_PX), to: landing }
    : { kind: 'arrive', to: landing };
}
