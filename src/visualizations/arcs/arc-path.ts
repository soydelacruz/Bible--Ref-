import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import type { PathStep } from '../shared/connection-path.ts';
import type { LightCurve, Point, TraceStyle } from '../shared/light-painter.ts';
import { arcPoint } from '../shared/loading-arcs.ts';
import { verseToAlong, type ArcLayout } from './arc-layout.ts';
import type { AxisView } from './axis-view.ts';

/** One hop of a chain, the way its light travels it: along its link's arc, from the step before. */
export interface ArcPathHop {
  /** Where the light sets off and lands, in verse units, at the arc's own ends (as the shaders'). */
  readonly from: number;
  readonly to: number;
  /** Genre ordinals there, which color the light from one to the other. */
  readonly fromGenre: number;
  readonly toGenre: number;
}

/** A chain of cross-references as `ArcsController.playPath` draws it (see `buildArcPath`). */
export interface ArcPath {
  /** The verse it starts from: it is over once the focus moves somewhere without that verse. */
  readonly origin: VerseIndex;
  readonly hops: readonly ArcPathHop[];
}

/**
 * The hops of a chain (from `findConnectionPath`), each along its link's own arc: from the source
 * to the target where the step before references this one, and the other way round where this one
 * references the step before.
 */
export function buildArcPath(
  index: CrossReferenceIndex,
  steps: readonly PathStep[],
  verseGenres: Uint8Array,
): ArcPath {
  const hops: ArcPathHop[] = [];
  for (const { hop } of steps) {
    if (!hop) continue;
    const source = elementAt(index.sources, hop.linkId);
    const targetStart = elementAt(index.targetStarts, hop.linkId);
    const targetEnd = elementAt(index.targetEnds, hop.linkId);
    const ends = {
      source: { at: source + 0.5, genre: elementAt(verseGenres, source) },
      target: { at: (targetStart + targetEnd + 1) / 2, genre: elementAt(verseGenres, targetStart) },
    };
    const [from, to] =
      hop.direction === 'outgoing' ? [ends.source, ends.target] : [ends.target, ends.source];
    hops.push({ from: from.at, to: to.at, fromGenre: from.genre, toGenre: to.genre });
  }
  return { origin: steps[0]?.verse ?? 0, hops };
}

/**
 * What a chain's arcs keep once its light has passed: a line that stays readable over the dimmed
 * glow and the focused passage's own links, without taking their place.
 */
export const ARC_PATH_TRACE: TraceStyle = { width: 1.6, alpha: 0.6 };

/**
 * Where a hop's light travels on screen at the window shown: its link's arc, half an ellipse over
 * the axis, as tall as half its width up to the layout's ceiling, exactly as the shaders draw it.
 */
export function arcPathCurve(layout: ArcLayout, view: AxisView, hop: ArcPathHop): LightCurve {
  const from = verseToAlong(layout, view, hop.from);
  const to = verseToAlong(layout, view, hop.to);
  const height = Math.min(Math.abs(to - from) / 2, layout.maxArcHeight);
  const pointAt = (t: number): Point => {
    const { x: along, y } = arcPoint({ from, to }, t);
    const across = y * height;
    return layout.orientation === 'horizontal'
      ? [along, layout.baseline - across]
      : [layout.baseline + across, along];
  };
  return { pointAt, fromGenre: hop.fromGenre, toGenre: hop.toGenre };
}
