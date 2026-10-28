import { bookName, bookReferenceName } from '../../core/bible/reference-format.ts';
import type { VerseIndexRange, Versification } from '../../core/bible/versification.ts';
import type { BookNames } from '../../i18n/books/types.ts';
import { clampView, fullView, panView, resizeView, zoomView, type AxisView } from './axis-view.ts';

/*
 * The minimap: a thin strip of the whole Bible beside the axis, with a window over the part the
 * axis shows. Its track runs along the same pixels as the axis, so at the whole-Bible view the two
 * line up book for book. This is the strip's arithmetic; `Minimap.tsx` wires it to the pointer and
 * the keyboard, and `paintMinimap` draws it.
 */

/** Where the track lies along the strip, in px: the same span as the axis. */
export interface MinimapTrack {
  readonly start: number;
  readonly end: number;
}

/** The verse coordinate at `along` px on the track; past an end, it is past the canon. */
export function trackToVerse(track: MinimapTrack, total: number, along: number): number {
  const length = track.end - track.start;
  return length > 0 ? ((along - track.start) / length) * total : 0;
}

/** Where a verse coordinate lies on the track, in px. */
export function verseToTrack(track: MinimapTrack, total: number, verse: number): number {
  return track.start + (verse / total) * (track.end - track.start);
}

/** How far a press reaches for the window, in px. */
export interface GrabReach {
  /** How far outside an edge it still takes hold of that edge. */
  readonly edge: number;
  /** A window narrower than this is held as if it were this wide: a deep zoom stays grabbable. */
  readonly body: number;
}

export const MOUSE_REACH: GrabReach = { edge: 8, body: 8 };
/** A fingertip hides far more than a pixel, and a deep zoom's window is barely one. */
export const TOUCH_REACH: GrabReach = { edge: 18, body: 26 };

/** The window's extent on the track, at least `minWidth` px wide around its middle. */
export function windowOnTrack(
  track: MinimapTrack,
  total: number,
  view: AxisView,
  minWidth: number,
): MinimapTrack {
  const from = verseToTrack(track, total, view.start);
  const to = verseToTrack(track, total, view.end);
  const half = Math.max((to - from) / 2, minWidth / 2);
  const middle = (from + to) / 2;
  return { start: middle - half, end: middle + half };
}

/** What a press on the strip takes hold of: the window, one of its edges, or books to brush. */
export type MinimapGrab = 'window' | 'start' | 'end' | 'brush';

/**
 * What a press `along` the strip takes hold of: an edge of the window (from just outside it to a
 * little way in), its body, or anything else, which brushes books. A window that already shows
 * the whole Bible has nowhere to go, so pressing inside it brushes too; only its edges zoom.
 */
export function grabAt(
  track: MinimapTrack,
  total: number,
  view: AxisView,
  along: number,
  reach: GrabReach,
): MinimapGrab {
  const frame = windowOnTrack(track, total, view, reach.body);
  const inside = Math.min(reach.edge / 3, (frame.end - frame.start) / 4);
  if (along >= frame.start - reach.edge && along <= frame.start + inside) {
    return 'start';
  }
  if (along >= frame.end - inside && along <= frame.end + reach.edge) {
    return 'end';
  }
  const pans = view.end - view.start < total;
  return pans && along > frame.start && along < frame.end ? 'window' : 'brush';
}

/** A press on the strip, held: what it took hold of, the window then, and the verse under it. */
export interface MinimapPress {
  readonly grab: MinimapGrab;
  readonly view: AxisView;
  readonly verse: number;
}

/**
 * The window a held press asks for, now that the pointer is over `verse`. The body moves with the
 * pointer; an edge follows it, keeping the gap the press began with so that nothing jumps. A brush
 * leaves the window be.
 */
export function dragView(press: MinimapPress, verse: number, total: number): AxisView {
  const moved = verse - press.verse;
  switch (press.grab) {
    case 'window':
      return panView(press.view, moved, total);
    case 'start':
      return resizeView(press.view, 'start', press.view.start + moved, total);
    case 'end':
      return resizeView(press.view, 'end', press.view.end + moved, total);
    case 'brush':
      return press.view;
  }
}

/** The verse a coordinate falls in, kept inside the canon. */
function verseAt(versification: Versification, coordinate: number): number {
  return Math.min(Math.max(Math.floor(coordinate), 0), versification.verseCount - 1);
}

/**
 * The whole books from the one at `from` to the one at `to`, either way round, as one range: a
 * brush snaps to book boundaries.
 */
export function bookSpan(versification: Versification, from: number, to: number): VerseIndexRange {
  const first = versification.bookAt(verseAt(versification, Math.min(from, to)));
  const last = versification.bookAt(verseAt(versification, Math.max(from, to)));
  return {
    start: versification.bookRange(first.id).start,
    end: versification.bookRange(last.id).end,
  };
}

/** The whole books any part of a window shows: what Enter lights up. */
export function booksInView(versification: Versification, view: AxisView): VerseIndexRange {
  return bookSpan(versification, view.start, Math.ceil(view.end) - 1);
}

/**
 * The brush a tap at `verse` leaves: on the books lit up, none (a tap there clears them);
 * anywhere else, the book it fell on.
 */
export function tapBrush(
  versification: Versification,
  brush: VerseIndexRange | null,
  verse: number,
): VerseIndexRange | null {
  const tapped = verseAt(versification, verse);
  if (brush && tapped >= brush.start && tapped <= brush.end) {
    return null;
  }
  return bookSpan(versification, tapped, tapped);
}

/** Names whole books, e.g. `Psalms` or `Genesis – Deuteronomy`. */
export function describeBooks(
  range: VerseIndexRange,
  versification: Versification,
  names: BookNames,
): string {
  const first = versification.bookAt(range.start).id;
  const last = versification.bookAt(range.end).id;
  return first === last
    ? bookName(first, names)
    : `${bookName(first, names)} – ${bookName(last, names)}`;
}

/**
 * Names what a window shows, as a reader would say it: the books it reaches, or inside one book
 * its chapters. E.g. `Genesis – Deuteronomy`, `Psalms 23–25`, `Psalm 23`, `Ruth`.
 */
export function describeView(
  view: AxisView,
  versification: Versification,
  names: BookNames,
): string {
  const first = versification.refAt(verseAt(versification, view.start));
  const last = versification.refAt(verseAt(versification, Math.ceil(view.end) - 1));
  if (first.book !== last.book) {
    return `${bookName(first.book, names)} – ${bookName(last.book, names)}`;
  }
  const book = versification.bookRange(first.book);
  if (view.start <= book.start && view.end >= book.end + 1) {
    return bookName(first.book, names);
  }
  if (first.chapter === last.chapter) {
    return `${bookReferenceName(first.book, names)} ${String(first.chapter)}`;
  }
  return `${bookName(first.book, names)} ${String(first.chapter)}–${String(last.chapter)}`;
}

/** What a key does on the minimap: moves the window, or lights up or clears books. */
export type MinimapKeyAction =
  | { readonly kind: 'view'; readonly next: (view: AxisView) => AxisView }
  | { readonly kind: 'light' }
  | { readonly kind: 'clear' };

/** A key's step moves or zooms the window by as much as the stage's own keys do. */
const KEY_PAN_SHARE = 0.15;
const KEY_ZOOM = 1.6;

/**
 * The minimap's keys: the arrows step the window as the stage's do, Page Up and Down by a whole
 * window, Home and End to either end; + and − zoom it about its middle, 0 shows the whole Bible.
 * Enter lights up the books in view, Escape clears them.
 */
export function minimapKeyAction(key: string, total: number): MinimapKeyAction | null {
  const span = (view: AxisView) => view.end - view.start;
  const middle = (view: AxisView) => (view.start + view.end) / 2;
  const step = (next: (view: AxisView) => AxisView): MinimapKeyAction => ({ kind: 'view', next });
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return step((view) => panView(view, -span(view) * KEY_PAN_SHARE, total));
    case 'ArrowRight':
    case 'ArrowDown':
      return step((view) => panView(view, span(view) * KEY_PAN_SHARE, total));
    case 'PageUp':
      return step((view) => panView(view, -span(view), total));
    case 'PageDown':
      return step((view) => panView(view, span(view), total));
    case 'Home':
      return step((view) => clampView({ start: 0, end: span(view) }, total));
    case 'End':
      return step((view) => clampView({ start: total - span(view), end: total }, total));
    case '+':
    case '=':
      return step((view) => zoomView(view, KEY_ZOOM, middle(view), total));
    case '-':
    case '_':
      return step((view) => zoomView(view, 1 / KEY_ZOOM, middle(view), total));
    case '0':
      return step(() => fullView(total));
    case 'Enter':
    case ' ':
      return { kind: 'light' };
    case 'Escape':
      return { kind: 'clear' };
    default:
      return null;
  }
}
