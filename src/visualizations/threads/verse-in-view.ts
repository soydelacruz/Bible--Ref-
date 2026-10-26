/**
 * Where the selected verse sits in the reading pane, in viewport pixels (as
 * `getBoundingClientRect` reports them).
 */
export interface VerseLayout {
  readonly verseTop: number;
  readonly verseBottom: number;
  readonly paneTop: number;
  readonly paneBottom: number;
  /**
   * The bottom edge of the chapter bar. The bar sticks to the top of the pane and is opaque, so
   * a verse is in view only below it, not merely below the pane's top.
   */
  readonly barBottom: number;
}

/** Rounding slack: a verse a fraction of a pixel under the bar is not worth a scroll. */
const SLACK_PX = 1;

/**
 * How to scroll the selected verse into view, or `null` when it is already wholly in view.
 *
 * - A verse taller than half the pane goes to the top: aligned to its nearest edge it would show
 *   its last lines, and a verse is read from the start.
 * - A verse partly hidden or just past an edge, as when stepping verse by verse, moves the least
 *   (`'nearest'`): off the top it lands under the bar, off the bottom above the pane's bottom edge.
 * - A verse well out of sight (a shared link, a cross-reference followed within the chapter) goes
 *   to the middle, with the verses around it in view; at an edge it would read as cut off.
 */
export function revealBlock(layout: VerseLayout): ScrollLogicalPosition | null {
  const { verseTop, verseBottom, paneTop, paneBottom, barBottom } = layout;
  const hidden = verseTop < barBottom - SLACK_PX || verseBottom > paneBottom + SLACK_PX;
  if (!hidden) {
    return null;
  }
  const paneHeight = paneBottom - paneTop;
  if (verseBottom - verseTop > paneHeight / 2) {
    return 'start';
  }
  const reach = paneHeight / 4;
  const far = verseBottom < barBottom - reach || verseTop > paneBottom + reach;
  return far ? 'center' : 'nearest';
}
