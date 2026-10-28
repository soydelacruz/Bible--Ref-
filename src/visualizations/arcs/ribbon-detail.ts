/** Segments of a ribbon in full detail: enough that the biggest arc on a phone stays smooth. */
export const RIBBON_SEGMENTS = 64;

/** The most ribbons drawn in full detail: more than any one passage's, or a typical brush's. */
export const FULL_DETAIL_RIBBONS = 100_000;

/** The fewest segments a ribbon is drawn with, however many there are. */
export const MIN_RIBBON_SEGMENTS = 16;

/**
 * How many segments each of `count` ribbons is drawn with. What a GPU spends on ribbons goes with
 * their triangles, two a segment, and books lit up over most of the Bible are a quarter of a
 * million ribbons: in full detail, more triangles than a phone draws in a frame. So past
 * `FULL_DETAIL_RIBBONS` (the Gospels light 68,000 links), ribbons get fewer segments, keeping the
 * triangles at what that many full ribbons cost. In so dense a crowd no one arc can be followed
 * far enough for its facets to show.
 */
export function ribbonSegments(count: number): number {
  const segments = Math.round((RIBBON_SEGMENTS * FULL_DETAIL_RIBBONS) / Math.max(count, 1));
  return Math.min(Math.max(segments, MIN_RIBBON_SEGMENTS), RIBBON_SEGMENTS);
}
