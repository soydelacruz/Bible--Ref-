import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import type { PathStep } from '../shared/connection-path.ts';
import type { LightCurve, TraceStyle } from '../shared/light-painter.ts';
import type { ClusterLayout } from './cluster-layout.ts';

/** One hop of a chain, the way its light travels it in Clusters: between its link's two dots. */
export interface ClusterPathHop {
  readonly from: VerseIndex;
  readonly to: VerseIndex;
}

/**
 * The hops of a chain (from `findConnectionPath`) between the dots Clusters draws their links
 * between: a link's source verse and the first verse of its target (see `selectClusterGraph`).
 * Each sets off from the step before: from the source where that step references this one, from
 * the target where this one references that step.
 */
export function clusterPathHops(
  index: CrossReferenceIndex,
  steps: readonly PathStep[],
): ClusterPathHop[] {
  const hops: ClusterPathHop[] = [];
  for (const { hop } of steps) {
    if (!hop) continue;
    const source = elementAt(index.sources, hop.linkId);
    const target = elementAt(index.targetStarts, hop.linkId);
    hops.push(
      hop.direction === 'outgoing' ? { from: source, to: target } : { from: target, to: source },
    );
  }
  return hops;
}

/**
 * What a chain's links keep once its light has passed: brighter than a link drawn faintly at rest,
 * so that the chain reads over the dimmed picture, and thinner than a pointed-at passage's.
 */
export const CLUSTER_PATH_TRACE: TraceStyle = { width: 1.2, alpha: 0.75 };

/**
 * Where a hop's light travels: straight from one dot to the other, as the links are drawn. `null`
 * where either end has no dot in this picture: a book is open that the link does not touch.
 */
export function clusterPathCurve(
  layout: ClusterLayout,
  verseGenres: Uint8Array,
  hop: ClusterPathHop,
): LightCurve | null {
  const from = elementAt(layout.nodeOf, hop.from);
  const to = elementAt(layout.nodeOf, hop.to);
  if (from < 0 || to < 0) {
    return null;
  }
  const x0 = elementAt(layout.x, from);
  const y0 = elementAt(layout.y, from);
  const x1 = elementAt(layout.x, to);
  const y1 = elementAt(layout.y, to);
  return {
    pointAt: (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t],
    fromGenre: elementAt(verseGenres, hop.from),
    toGenre: elementAt(verseGenres, hop.to),
  };
}
