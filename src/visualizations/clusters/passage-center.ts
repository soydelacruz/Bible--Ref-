import type { VerseIndexRange } from '../../core/bible/versification.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { ClusterLayout } from './cluster-layout.ts';

/**
 * Where a passage is among the clusters, in the stage's pixels: a verse's dot, or the middle of a
 * chapter's dots. `null` when none of its verses has a dot (no link of theirs is drawn).
 */
export function passageCenter(
  layout: ClusterLayout,
  range: VerseIndexRange,
): { readonly x: number; readonly y: number } | null {
  let x = 0;
  let y = 0;
  let count = 0;
  for (let verse = range.start; verse <= range.end; verse += 1) {
    const position = elementAt(layout.nodeOf, verse);
    if (position >= 0) {
      x += elementAt(layout.x, position);
      y += elementAt(layout.y, position);
      count += 1;
    }
  }
  return count === 0 ? null : { x: x / count, y: y / count };
}
