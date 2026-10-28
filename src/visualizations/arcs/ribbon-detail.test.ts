import { describe, expect, it } from 'vitest';
import {
  FULL_DETAIL_RIBBONS,
  MIN_RIBBON_SEGMENTS,
  RIBBON_SEGMENTS,
  ribbonSegments,
} from './ribbon-detail.ts';

describe('how finely ribbons are drawn', () => {
  it('is in full for a passage’s links or a typical brush’s, such as the Gospels’', () => {
    for (const count of [0, 1, 300, 68_249, FULL_DETAIL_RIBBONS]) {
      expect(ribbonSegments(count)).toBe(RIBBON_SEGMENTS);
    }
  });

  it('keeps a crowd of ribbons to the triangles of full detail, give or take a segment', () => {
    // Genesis to Zechariah, with every link shown.
    const count = 259_606;
    const segments = ribbonSegments(count);
    expect(segments).toBeLessThan(RIBBON_SEGMENTS);
    expect(count * (segments - 0.5)).toBeLessThanOrEqual(FULL_DETAIL_RIBBONS * RIBBON_SEGMENTS);
    expect(count * (segments + 0.5)).toBeGreaterThanOrEqual(FULL_DETAIL_RIBBONS * RIBBON_SEGMENTS);
  });

  it('never goes below a floor, however many there are', () => {
    expect(ribbonSegments(10_000_000)).toBe(MIN_RIBBON_SEGMENTS);
  });
});
