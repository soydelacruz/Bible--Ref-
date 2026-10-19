import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { GENRE_HEX } from '../shared/palette.ts';
import type { ClusterGroup, ClusterLayout, ClusterSide } from './cluster-layout.ts';

/**
 * The faint haze of every link drawn: enough of them at once read as a texture, not lines. The
 * more links, the fainter each, so that a hundred thousand of them make a mist rather than a wall.
 */
const HAZE_WIDTH = 0.5;

function hazeAlpha(links: number): number {
  return Math.min(0.06, 4 / Math.sqrt(Math.max(1, links)));
}
const LABEL_COLOR = 'rgba(235, 235, 235, 0.78)';
const HEADING_COLOR = 'rgba(235, 235, 235, 0.55)';

export interface BaseScene {
  readonly layout: ClusterLayout;
  readonly index: CrossReferenceIndex;
  readonly linkIds: Int32Array;
  readonly verseGenres: Uint8Array;
  /** A cluster's name, in full and in short (for where the full name has no room). */
  readonly label: (group: ClusterGroup) => { readonly full: string; readonly short: string };
  /** The heading over each band, e.g. "Old Testament". */
  readonly headings: Readonly<Partial<Record<ClusterSide, string>>>;
  readonly fontFamily: string;
}

/** Dots of one genre in one path: ten fills instead of one per verse. */
function fillDots(
  context: CanvasRenderingContext2D,
  layout: ClusterLayout,
  positions: Iterable<number>,
  verseGenres: Uint8Array,
  radius: number,
): void {
  const paths = GENRE_HEX.map(() => new Path2D());
  for (const position of positions) {
    const genre = elementAt(verseGenres, elementAt(layout.nodes, position));
    const x = elementAt(layout.x, position);
    const y = elementAt(layout.y, position);
    const path = elementAt(paths, genre);
    path.moveTo(x + radius, y);
    path.arc(x, y, radius, 0, Math.PI * 2);
  }
  paths.forEach((path, genre) => {
    context.fillStyle = elementAt(GENRE_HEX, genre);
    context.fill(path);
  });
}

/** The picture at rest: the haze of links, every dot, and the names of the clusters. */
export function drawBase(context: CanvasRenderingContext2D, scene: BaseScene): void {
  const { layout, index, linkIds, verseGenres } = scene;
  context.clearRect(0, 0, layout.width, layout.height);

  context.strokeStyle = `rgba(255, 255, 255, ${String(hazeAlpha(linkIds.length))})`;
  context.lineWidth = HAZE_WIDTH;
  context.beginPath();
  for (const id of linkIds) {
    const from = elementAt(layout.nodeOf, elementAt(index.sources, id));
    const to = elementAt(layout.nodeOf, elementAt(index.targetStarts, id));
    context.moveTo(elementAt(layout.x, from), elementAt(layout.y, from));
    context.lineTo(elementAt(layout.x, to), elementAt(layout.y, to));
  }
  context.stroke();

  context.globalAlpha = 0.9;
  fillDots(context, layout, layout.nodes.keys(), verseGenres, layout.dotRadius);
  context.globalAlpha = 1;

  drawLabels(context, scene);
}

function drawLabels(context: CanvasRenderingContext2D, scene: BaseScene): void {
  const { layout, fontFamily } = scene;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillStyle = LABEL_COLOR;
  // The biggest clusters are named first; a name that would run into one already placed is left
  // out (pointing at its cluster still names it).
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const bySize = [...layout.groups].sort((a, b) => b.r - a.r);
  for (const group of bySize) {
    const height = group.chapter === null ? 11 : 10;
    context.font = `${String(height)}px ${fontFamily}`;
    const { full, short } = scene.label(group);
    const room = Math.max(2 * group.r + 24, 48);
    const text = context.measureText(full).width <= room ? full : short;
    const width = context.measureText(text).width;
    const y = group.y - group.r - 3;
    const box = { x0: group.x - width / 2 - 2, x1: group.x + width / 2 + 2, y0: y - height, y1: y };
    const clashes = placed.some(
      (other) => box.x0 < other.x1 && other.x0 < box.x1 && box.y0 < other.y1 && other.y0 < box.y1,
    );
    if (clashes) continue;
    placed.push(box);
    context.fillText(text, group.x, y);
  }

  context.font = `600 11px ${fontFamily}`;
  context.fillStyle = HEADING_COLOR;
  context.textBaseline = 'alphabetic';
  for (const side of ['start', 'center', 'end'] as const) {
    const band = layout.bands[side];
    const heading = scene.headings[side];
    if (!band || !heading) continue;
    context.fillText(heading.toUpperCase(), (band.x0 + band.x1) / 2, Math.max(14, band.y0 - 4));
  }
}

/** Links to stand out, as pairs of dot positions, each colored by a genre. */
export interface Segments {
  readonly from: Int32Array;
  readonly to: Int32Array;
  readonly genre: Uint8Array;
}

export interface Overlay {
  readonly layout: ClusterLayout;
  readonly verseGenres: Uint8Array;
  readonly segments: Segments;
  /** How far the links have grown from their start, in [0, 1]. */
  readonly progress: number;
  /** Bold for one passage's links, faint for a whole book's. */
  readonly strength: 'strong' | 'soft';
  /** Dots drawn bright over the dimmed picture: the ends of the links. */
  readonly marked: Iterable<number>;
  /** Dots ringed: the focused passage. */
  readonly ringed: readonly number[];
}

/** What stands out over the picture: the links of a passage or a book, and their dots. */
export function drawOverlay(context: CanvasRenderingContext2D, overlay: Overlay): void {
  const { layout, segments, progress, strength, verseGenres } = overlay;
  context.clearRect(0, 0, layout.width, layout.height);
  if (segments.from.length > 0) {
    const paths = GENRE_HEX.map(() => new Path2D());
    segments.from.forEach((from, i) => {
      const to = elementAt(segments.to, i);
      const x0 = elementAt(layout.x, from);
      const y0 = elementAt(layout.y, from);
      const path = elementAt(paths, elementAt(segments.genre, i));
      path.moveTo(x0, y0);
      path.lineTo(
        x0 + (elementAt(layout.x, to) - x0) * progress,
        y0 + (elementAt(layout.y, to) - y0) * progress,
      );
    });
    context.lineWidth = strength === 'strong' ? 1.2 : 0.7;
    context.globalAlpha = strength === 'strong' ? 0.85 : 0.3;
    paths.forEach((path, genre) => {
      context.strokeStyle = elementAt(GENRE_HEX, genre);
      context.stroke(path);
    });
    context.globalAlpha = 1;
  }

  const radius = layout.dotRadius * (strength === 'strong' ? 1.6 : 1.2);
  fillDots(context, layout, overlay.marked, verseGenres, radius);

  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  for (const position of overlay.ringed) {
    context.beginPath();
    context.arc(
      elementAt(layout.x, position),
      elementAt(layout.y, position),
      Math.max(4, layout.dotRadius * 2.6),
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
}
