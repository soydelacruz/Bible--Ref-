import { describe, expect, it } from 'vitest';
import { revealBlock, type VerseLayout } from './verse-in-view.ts';

/** A 600px pane whose chapter bar ends 48px down, holding a 30px verse wherever it is put. */
function layout(verseTop: number, verseHeight = 30): VerseLayout {
  return {
    verseTop,
    verseBottom: verseTop + verseHeight,
    paneTop: 100,
    paneBottom: 700,
    barBottom: 148,
  };
}

describe('bringing the selected verse into view', () => {
  it('leaves a verse alone that is wholly on screen', () => {
    expect(revealBlock(layout(300))).toBeNull();
  });

  it('leaves a verse alone that touches the bar or the bottom edge', () => {
    expect(revealBlock(layout(148))).toBeNull();
    expect(revealBlock(layout(670))).toBeNull();
    // A fraction of a pixel either way is rounding, not a hidden verse.
    expect(revealBlock(layout(147.5))).toBeNull();
    expect(revealBlock(layout(670.5))).toBeNull();
  });

  it('moves a verse out from under the bar, though it is inside the pane', () => {
    // The pane's top is at 100, so this verse is "in the pane" — and behind the bar.
    expect(revealBlock(layout(120))).toBe('nearest');
  });

  it('moves a verse just past an edge the least it can, as stepping verse by verse does', () => {
    // Wholly under the bar, a line's height above it.
    expect(revealBlock(layout(90))).toBe('nearest');
    // Wholly below the pane, within a quarter of its height (150px) of the edge.
    expect(revealBlock(layout(690))).toBe('nearest');
    expect(revealBlock(layout(849))).toBe('nearest');
  });

  it('centres a verse that is well out of sight, so the verses around it show too', () => {
    expect(revealBlock(layout(851))).toBe('center');
    expect(revealBlock(layout(2000))).toBe('center');
    expect(revealBlock(layout(-400))).toBe('center');
  });

  it('puts a verse taller than half the pane at the top, so it reads from its start', () => {
    expect(revealBlock(layout(500, 301))).toBe('start');
    expect(revealBlock(layout(-900, 400))).toBe('start');
    expect(revealBlock(layout(500, 300))).toBe('nearest');
  });
});
