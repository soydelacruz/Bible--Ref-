import type { CSSProperties } from 'react';
import type { SteadySize } from './use-element-size.ts';

/** A stretch of the picture, top to bottom, in its own CSS pixels. */
export interface Stretch {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The bottom sheet's own motion (`--sheet-motion` in VizPage.module.css): the picture slides up
 * with it, so the two read as one movement.
 */
const SHEET_MOTION = '0.5s cubic-bezier(0.32, 0.72, 0, 1)';

/** With reduced motion the picture moves at once, and fades back in over this, in ms. */
const STILL_FADE_MS = 200;

/** How much room is kept around a passage brought into sight, as a share of what shows. */
const MARGIN_SHARE = 0.25;

/**
 * A stretch around a point that keeps a margin of the visible height either side of it, so a
 * passage brought into sight is not left at the very edge.
 */
export function stretchAround(y: number, size: SteadySize): Stretch {
  const margin = (size.height - size.covered) * MARGIN_SHARE;
  return { top: y - margin, bottom: y + margin };
}

/**
 * How far to slide a picture up under a bottom sheet (see `useSteadySize`), from `current`, so
 * that `wanted` is in sight above the sheet: not at all while it already is, and otherwise as
 * little as brings it in (its middle, if it is taller than what shows). Never more than the sheet
 * covers, and nothing without a sheet; with nothing wanted, the picture stays where it is.
 */
export function slideToShow(wanted: Stretch | null, current: number, size: SteadySize): number {
  const { height, covered } = size;
  if (covered <= 0) {
    return 0;
  }
  const visible = height - covered;
  let next = current;
  if (wanted) {
    if (wanted.bottom - wanted.top > visible) {
      next = (wanted.top + wanted.bottom - visible) / 2;
    } else if (wanted.top < current) {
      next = wanted.top;
    } else if (wanted.bottom > current + visible) {
      next = wanted.bottom - visible;
    }
  }
  return Math.min(covered, Math.max(0, next));
}

/**
 * The picture's own box, over a box that fills the stage: never shorter than the stage would be
 * without a sheet, so the sheet coming up does not resize it, while a stage that grows (a window
 * made taller) takes it along at once.
 */
export function steadyBox(size: SteadySize): CSSProperties {
  return { minBlockSize: size.height };
}

/**
 * Slides `picture` `offset` pixels up, with the sheet's motion; with reduced motion it moves at
 * once and fades back in, so the move still shows without travelling.
 */
export function slidePicture(picture: HTMLElement, offset: number): void {
  const transform = offset > 0 ? `translateY(${String(-offset)}px)` : '';
  if (picture.style.transform === transform) {
    return;
  }
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  picture.style.transition = still ? '' : `transform ${SHEET_MOTION}`;
  picture.style.transform = transform;
  if (still) {
    picture.animate([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: STILL_FADE_MS,
      easing: 'ease-out',
    });
  }
}
