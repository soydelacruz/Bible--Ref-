import type { VerseIndexRange } from '../../../core/bible/versification.ts';
import { clampView, type AxisView } from '../axis-view.ts';

/**
 * A close-up shows at least this many verses: the passage, and a few books' worth around it, so
 * links reaching far still rise as arcs. Much closer, they leave the screen almost flat, on a few
 * straight facets of their curve.
 */
const CLOSE_UP_SPAN = 900;
/** And at least this many times the passage, so a long chapter fits with room to spare. */
const CLOSE_UP_SHARE = 12;
/** A framing leaves this share of what it shows free on either side, clear of the screen's edges. */
const FRAME_MARGIN = 0.1;

/**
 * Up close on a passage: where its links leave from. Those reaching far go off screen, which is
 * the point: the next shot pulls back to show where they land.
 */
export function closeUpView(range: VerseIndexRange, total: number): AxisView {
  const span = Math.max((range.end + 1 - range.start) * CLOSE_UP_SHARE, CLOSE_UP_SPAN);
  const center = (range.start + range.end + 1) / 2;
  return clampView({ start: center - span / 2, end: center + span / 2 }, total);
}

/**
 * `view` drawn back from its end, so that all it showed fits past the first `share` of the axis,
 * which something covers: on an upright phone the tour's card lies across the top of the axis.
 * At the very start of the canon there is nothing before it to draw back to, so it only widens.
 */
export function clearStart(view: AxisView, share: number, total: number): AxisView {
  if (share <= 0) {
    return view;
  }
  const span = (view.end - view.start) / (1 - share);
  return clampView({ start: view.end - span, end: view.end }, total);
}

/** Every one of `ranges` in sight at once, with a margin, so the arcs between them show whole. */
export function framingView(ranges: readonly VerseIndexRange[], total: number): AxisView {
  const start = Math.min(...ranges.map((range) => range.start));
  const end = Math.max(...ranges.map((range) => range.end + 1));
  const margin = (end - start) * FRAME_MARGIN;
  return clampView({ start: start - margin, end: end + margin }, total);
}
