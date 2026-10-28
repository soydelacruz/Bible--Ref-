import { BOOKS } from '../../core/bible/books.ts';
import { GENRES, getBookGenre, getGenreBooks } from '../../core/bible/genres.ts';
import type { GenreId } from '../../core/bible/genres.ts';
import type { VerseIndexRange, Versification } from '../../core/bible/versification.ts';
import type { BookNames } from '../../i18n/books/types.ts';
import { elementAt } from '../../core/lib/array.ts';
import { GENRE_HEX } from '../shared/palette.ts';
import { verseToAlong, type ArcLayout, type Orientation } from './arc-layout.ts';
import type { AxisView } from './axis-view.ts';
import { MOUSE_REACH, verseToTrack, windowOnTrack, type MinimapTrack } from './minimap-strip.ts';

export interface AxisPaint {
  readonly layout: ArcLayout;
  readonly view: AxisView;
  readonly versification: Versification;
  /** Book and genre names in the reader's language: the axis is read, not only looked at. */
  readonly names: BookNames;
  readonly genreNames: Readonly<Record<GenreId, string>>;
  readonly focus: VerseIndexRange | null;
  readonly hover: VerseIndexRange | null;
  /** A passage a previewed link points to: a band quieter than hover's, under the focus. */
  readonly passage: VerseIndexRange | null;
  /**
   * Books lit up from the minimap: a quiet band too, since a solid one would hide whole books'
   * colors; the focused passage keeps its own mark.
   */
  readonly brush?: VerseIndexRange | null;
}

const TEXT = '#ecebe6';
const MUTED = '#9a9890';
const AXIS = '#3a3935';
const BAR_OFFSET = 3;
const BAR_THICKNESS = 8;
const LABEL_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
const GENRE_FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Fills a rectangle given in along/across coordinates. "Across" values grow away from the arcs:
 * downward when the axis is horizontal, leftward (mirrored around the axis) when it is vertical.
 */
function fillAlong(
  context: CanvasRenderingContext2D,
  layout: ArcLayout,
  alongFrom: number,
  alongTo: number,
  acrossFrom: number,
  acrossTo: number,
): void {
  if (layout.orientation === 'horizontal') {
    context.fillRect(alongFrom, acrossFrom, alongTo - alongFrom, acrossTo - acrossFrom);
    return;
  }
  const mirroredLeft = 2 * layout.baseline - acrossTo;
  context.fillRect(mirroredLeft, alongFrom, acrossTo - acrossFrom, alongTo - alongFrom);
}

/**
 * Paints the axis overlay: genre-colored book bars, chapter ticks, labels that fit, and the hover
 * and focus markers. The whole Bible, with the window in view, is the minimap's (`paintMinimap`).
 */
export function paintAxis(context: CanvasRenderingContext2D, paint: AxisPaint): void {
  const { layout, view, versification } = paint;
  context.clearRect(0, 0, layout.width, layout.height);
  const along = (verse: number) => verseToAlong(layout, view, verse);
  const visible = (from: number, to: number) => to >= layout.axisStart && from <= layout.axisEnd;
  const clampAlong = (value: number) => Math.min(Math.max(value, layout.axisStart), layout.axisEnd);
  const barFrom = layout.baseline + BAR_OFFSET;
  const barTo = barFrom + BAR_THICKNESS;

  // Axis line.
  context.fillStyle = AXIS;
  fillAlong(
    context,
    layout,
    layout.axisStart,
    layout.axisEnd,
    layout.baseline,
    layout.baseline + 1,
  );

  // Book bars; alternate books of a genre are dimmer so neighbors stay distinguishable.
  for (const book of BOOKS) {
    const range = versification.bookRange(book.id);
    const from = along(range.start);
    const to = along(range.end + 1);
    if (!visible(from, to)) continue;
    const gap = to - from > 4 ? 1 : 0;
    context.globalAlpha = book.ordinal % 2 === 0 ? 1 : 0.72;
    context.fillStyle = elementAt(GENRE_HEX, getBookGenre(book.id).ordinal);
    fillAlong(context, layout, clampAlong(from) + gap, clampAlong(to) - gap, barFrom, barTo);
  }
  context.globalAlpha = 1;

  // Chapter ticks once chapters are wide enough to tell apart.
  const chapterPixels = ((layout.axisEnd - layout.axisStart) / (view.end - view.start)) * 26;
  if (chapterPixels > 10) {
    context.fillStyle = MUTED;
    for (const book of BOOKS) {
      for (let chapter = 1; chapter <= versification.chapterCountOf(book.id); chapter += 1) {
        const start = versification.chapterRange(book.id, chapter)?.start ?? 0;
        const position = along(start);
        if (position >= layout.axisStart && position <= layout.axisEnd) {
          fillAlong(context, layout, position, position + 1, barTo + 1, barTo + 4);
        }
      }
    }
  }

  const highlight = (range: VerseIndexRange | null, color: string, width: number) => {
    if (!range) return;
    const from = along(range.start);
    const to = along(range.end + 1);
    if (!visible(from, to)) return;
    context.fillStyle = color;
    const center = (clampAlong(from) + clampAlong(to)) / 2;
    const half = Math.max((clampAlong(to) - clampAlong(from)) / 2, width);
    fillAlong(context, layout, center - half, center + half, barFrom - 2, barTo + 2);
  };
  highlight(paint.brush ?? null, 'rgb(236 235 230 / 0.3)', 1.5);
  highlight(paint.passage, 'rgb(236 235 230 / 0.3)', 1.5);
  highlight(paint.hover, 'rgb(236 235 230 / 0.45)', 1.5);
  highlight(paint.focus, TEXT, 2);

  paintBookLabels(context, paint, along);
  if (layout.orientation === 'horizontal') {
    paintGenreLabels(context, paint, along);
  }
}

function paintBookLabels(
  context: CanvasRenderingContext2D,
  { layout, versification, names, focus, hover, passage, brush = null }: AxisPaint,
  along: (verse: number) => number,
): void {
  const horizontal = layout.orientation === 'horizontal';
  const labelOffset = BAR_OFFSET + BAR_THICKNESS;
  // Vertical axis: labels sit left of the bar, in the band between the stage edge and the axis.
  const sideRoom = layout.baseline - labelOffset - 8;
  context.font = LABEL_FONT;
  context.textBaseline = 'middle';
  context.textAlign = horizontal ? 'center' : 'right';
  const touches = (range: VerseIndexRange | null, start: number, end: number) =>
    range !== null && range.start <= end && range.end >= start;

  for (const book of BOOKS) {
    const range = versification.bookRange(book.id);
    const from = Math.max(along(range.start), layout.axisStart);
    const to = Math.min(along(range.end + 1), layout.axisEnd);
    const room = to - from;
    if (room <= 0) continue;
    const short = names[book.id].abbreviation ?? book.id;
    const candidates = [names[book.id].name, short];
    const label = horizontal
      ? candidates.find((text) => context.measureText(text).width + 8 <= room)
      : room >= 12
        ? candidates.find((text) => context.measureText(text).width <= sideRoom)
        : undefined;
    if (label === undefined) continue;
    const isActive =
      touches(focus, range.start, range.end) ||
      touches(hover, range.start, range.end) ||
      touches(passage, range.start, range.end) ||
      touches(brush, range.start, range.end);
    context.fillStyle = isActive ? TEXT : MUTED;
    const center = (from + to) / 2;
    if (horizontal) {
      context.fillText(label, center, layout.baseline + labelOffset + 12);
    } else {
      context.fillText(label, layout.baseline - labelOffset - 5, center);
    }
  }
}

function paintGenreLabels(
  context: CanvasRenderingContext2D,
  { layout, versification, genreNames }: AxisPaint,
  along: (verse: number) => number,
): void {
  context.font = GENRE_FONT;
  context.textAlign = 'center';
  const y = layout.baseline + BAR_OFFSET + BAR_THICKNESS + 32;
  for (const genre of GENRES) {
    const books = getGenreBooks(genre.id);
    const first = books[0];
    const last = books.at(-1);
    if (!first || !last) continue;
    const from = Math.max(along(versification.bookRange(first).start), layout.axisStart);
    const to = Math.min(along(versification.bookRange(last).end + 1), layout.axisEnd);
    const label = genreNames[genre.id].toUpperCase();
    if (to - from < context.measureText(label).width + 16) continue;
    const center = (from + to) / 2;
    const textWidth = context.measureText(label).width;
    context.fillStyle = elementAt(GENRE_HEX, genre.ordinal);
    context.fillRect(center - textWidth / 2 - 12, y - 1, 8, 2);
    context.fillStyle = MUTED;
    context.fillText(label, center + 2, y);
  }
}

export interface MinimapPaint {
  /** Along the strip as the axis runs: across the stage's foot, or down its side. */
  readonly orientation: Orientation;
  /** The strip's size, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Where the track lies along the strip: the same span as the axis. */
  readonly track: MinimapTrack;
  /** The window as the axis shows it. */
  readonly view: AxisView;
  readonly versification: Versification;
  /** Books lit up, or being brushed. */
  readonly brush: VerseIndexRange | null;
}

const MINIMAP_BAR = 6;
const MINIMAP_FRAME = 12;
const MINIMAP_GRIP = 14;
/** The least width of the window's frame, so a deep zoom still shows where it is. */
const MINIMAP_MIN_WINDOW = MOUSE_REACH.body;
/** Books out of view recede under the page's own color. */
const MINIMAP_OUT_OF_VIEW = 'rgb(13 13 13 / 0.62)';

/**
 * Paints the minimap: the whole Bible's books in their genre colors, as the axis shows them, the
 * part out of view receding; a frame over the window, with a grip on each edge to zoom by; and a
 * line under any books brushed.
 */
export function paintMinimap(context: CanvasRenderingContext2D, paint: MinimapPaint): void {
  const { orientation, width, height, track, view, versification, brush } = paint;
  const total = versification.verseCount;
  context.clearRect(0, 0, width, height);
  const middle = (orientation === 'horizontal' ? height : width) / 2;
  const fill = (alongFrom: number, alongTo: number, acrossFrom: number, acrossTo: number) => {
    if (orientation === 'horizontal') {
      context.fillRect(alongFrom, acrossFrom, alongTo - alongFrom, acrossTo - acrossFrom);
    } else {
      context.fillRect(acrossFrom, alongFrom, acrossTo - acrossFrom, alongTo - alongFrom);
    }
  };
  const at = (verse: number) => verseToTrack(track, total, verse);
  const barFrom = middle - MINIMAP_BAR / 2;
  const barTo = middle + MINIMAP_BAR / 2;

  for (const book of BOOKS) {
    const range = versification.bookRange(book.id);
    const from = at(range.start);
    const to = at(range.end + 1);
    const gap = to - from > 4 ? 0.5 : 0;
    context.globalAlpha = book.ordinal % 2 === 0 ? 1 : 0.72;
    context.fillStyle = elementAt(GENRE_HEX, getBookGenre(book.id).ordinal);
    fill(from + gap, to - gap, barFrom, barTo);
  }
  context.globalAlpha = 1;

  const frame = windowOnTrack(track, total, view, MINIMAP_MIN_WINDOW);
  context.fillStyle = MINIMAP_OUT_OF_VIEW;
  if (frame.start > track.start) fill(track.start, frame.start, barFrom, barTo);
  if (frame.end < track.end) fill(frame.end, track.end, barFrom, barTo);

  // The frame, its hairlines, and a grip on each edge.
  const frameFrom = middle - MINIMAP_FRAME / 2;
  const frameTo = middle + MINIMAP_FRAME / 2;
  context.fillStyle = TEXT;
  fill(frame.start, frame.end, frameFrom, frameFrom + 1);
  fill(frame.start, frame.end, frameTo - 1, frameTo);
  fill(frame.start, frame.start + 1, frameFrom, frameTo);
  fill(frame.end - 1, frame.end, frameFrom, frameTo);
  fill(frame.start - 1.5, frame.start + 1.5, middle - MINIMAP_GRIP / 2, middle + MINIMAP_GRIP / 2);
  fill(frame.end - 1.5, frame.end + 1.5, middle - MINIMAP_GRIP / 2, middle + MINIMAP_GRIP / 2);

  // Lit books: a line under the frame, clear of it.
  if (brush) {
    const from = at(brush.start);
    fill(from, Math.max(at(brush.end + 1), from + 2), frameTo + 2, frameTo + 4);
  }
}
