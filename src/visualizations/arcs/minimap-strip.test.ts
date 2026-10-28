import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { enBooks } from '../../i18n/books/en.ts';
import { verseIndex } from '../../test-utils/fixtures.ts';
import { fullView, MIN_VIEW_SPAN, type AxisView } from './axis-view.ts';
import {
  booksInView,
  bookSpan,
  describeBooks,
  describeView,
  dragView,
  grabAt,
  minimapKeyAction,
  MOUSE_REACH,
  tapBrush,
  TOUCH_REACH,
  trackToVerse,
  verseToTrack,
  windowOnTrack,
  type MinimapPress,
} from './minimap-strip.ts';

const versification = CANONICAL_VERSIFICATION;
const TOTAL = versification.verseCount;
/** A track as the axis lays one out on a 1,000px-wide stage: 32px in from either side. */
const TRACK = { start: 32, end: 968 };
const range = (book: Parameters<typeof versification.bookRange>[0]) =>
  versification.bookRange(book);

describe('the strip and the axis', () => {
  it('map the ends of the track to the ends of the canon, and back', () => {
    expect(trackToVerse(TRACK, TOTAL, 32)).toBe(0);
    expect(trackToVerse(TRACK, TOTAL, 968)).toBe(TOTAL);
    expect(trackToVerse(TRACK, TOTAL, 500)).toBeCloseTo(TOTAL / 2);
    expect(verseToTrack(TRACK, TOTAL, TOTAL / 4)).toBeCloseTo(266);
    for (const along of [32, 100, 437.5, 968]) {
      expect(verseToTrack(TRACK, TOTAL, trackToVerse(TRACK, TOTAL, along))).toBeCloseTo(along);
    }
  });

  it('read past the ends of the track as past the ends of the canon', () => {
    expect(trackToVerse(TRACK, TOTAL, 0)).toBeLessThan(0);
    expect(trackToVerse(TRACK, TOTAL, 1000)).toBeGreaterThan(TOTAL);
  });

  it('read a track not laid out yet as the start', () => {
    expect(trackToVerse({ start: 0, end: 0 }, TOTAL, 40)).toBe(0);
  });

  it('keep a deep zoom’s window wide enough to see and hold', () => {
    const view = { start: 10_000, end: 10_000 + MIN_VIEW_SPAN };
    const frame = windowOnTrack(TRACK, TOTAL, view, 8);
    expect(frame.end - frame.start).toBe(8);
    // Around the window's middle.
    expect((frame.start + frame.end) / 2).toBeCloseTo(
      verseToTrack(TRACK, TOTAL, 10_000 + MIN_VIEW_SPAN / 2),
    );
    const wide = windowOnTrack(TRACK, TOTAL, { start: 0, end: TOTAL / 2 }, 8);
    expect(wide).toEqual({ start: 32, end: 500 });
  });
});

describe('a press on the strip', () => {
  // A quarter of the canon, from a quarter of the way along: the track's 266–500px.
  const view: AxisView = { start: TOTAL / 4, end: TOTAL / 2 };

  it('takes the window by its body', () => {
    expect(grabAt(TRACK, TOTAL, view, 380, MOUSE_REACH)).toBe('window');
  });

  it('takes an edge from just outside it to a little way in', () => {
    expect(grabAt(TRACK, TOTAL, view, 260, MOUSE_REACH)).toBe('start');
    expect(grabAt(TRACK, TOTAL, view, 268, MOUSE_REACH)).toBe('start');
    expect(grabAt(TRACK, TOTAL, view, 506, MOUSE_REACH)).toBe('end');
    expect(grabAt(TRACK, TOTAL, view, 498, MOUSE_REACH)).toBe('end');
  });

  it('brushes anywhere else', () => {
    expect(grabAt(TRACK, TOTAL, view, 100, MOUSE_REACH)).toBe('brush');
    expect(grabAt(TRACK, TOTAL, view, 800, MOUSE_REACH)).toBe('brush');
  });

  it('reaches further for a fingertip', () => {
    expect(grabAt(TRACK, TOTAL, view, 252, MOUSE_REACH)).toBe('brush');
    expect(grabAt(TRACK, TOTAL, view, 252, TOUCH_REACH)).toBe('start');
  });

  it('holds a window too narrow to see by a body wide enough to hold', () => {
    const deep = { start: 15_000, end: 15_000 + MIN_VIEW_SPAN };
    const middle = verseToTrack(TRACK, TOTAL, 15_000 + MIN_VIEW_SPAN / 2);
    expect(grabAt(TRACK, TOTAL, deep, middle + 5, MOUSE_REACH)).toBe('end');
    expect(grabAt(TRACK, TOTAL, deep, middle + 5, TOUCH_REACH)).toBe('window');
    expect(grabAt(TRACK, TOTAL, deep, middle - 20, TOUCH_REACH)).toBe('start');
  });

  it('brushes inside a window that shows the whole Bible, which has nowhere to go', () => {
    const whole = fullView(TOTAL);
    expect(grabAt(TRACK, TOTAL, whole, 500, TOUCH_REACH)).toBe('brush');
    // Its edges still zoom, from the margins past the ends of the track.
    expect(grabAt(TRACK, TOTAL, whole, 20, TOUCH_REACH)).toBe('start');
    expect(grabAt(TRACK, TOTAL, whole, 980, TOUCH_REACH)).toBe('end');
  });
});

describe('dragging on the strip', () => {
  const view: AxisView = { start: 5000, end: 6000 };
  const press = (grab: MinimapPress['grab']): MinimapPress => ({ grab, view, verse: 5500 });

  it('moves the window with the pointer', () => {
    expect(dragView(press('window'), 5800, TOTAL)).toEqual({ start: 5300, end: 6300 });
    // As far as the canon goes, and no further.
    expect(dragView(press('window'), -20_000, TOTAL)).toEqual({ start: 0, end: 1000 });
  });

  it('moves an edge by as much as the pointer, wherever on the edge it was pressed', () => {
    expect(dragView({ ...press('start'), verse: 4990 }, 4000, TOTAL)).toEqual({
      start: 4010,
      end: 6000,
    });
    expect(dragView({ ...press('end'), verse: 6010 }, 9010, TOTAL)).toEqual({
      start: 5000,
      end: 9000,
    });
  });

  it('leaves the window be while brushing', () => {
    expect(dragView(press('brush'), 9000, TOTAL)).toBe(view);
  });
});

describe('brushing books', () => {
  it('snaps to whole books, whichever way it is dragged', () => {
    const lawEnd = range('Deut').end;
    const forward = bookSpan(versification, verseIndex('Gen', 12, 1), verseIndex('Deut', 3, 4));
    expect(forward).toEqual({ start: 0, end: lawEnd });
    expect(bookSpan(versification, verseIndex('Deut', 3, 4), verseIndex('Gen', 12, 1))).toEqual(
      forward,
    );
    expect(bookSpan(versification, 2000.5, 2000.5)).toEqual(range('Exod'));
  });

  it('keeps a drag past either end of the strip to the first or last book', () => {
    expect(bookSpan(versification, -400, 10)).toEqual(range('Gen'));
    expect(bookSpan(versification, TOTAL - 3, TOTAL + 900)).toEqual(range('Rev'));
  });

  it('lights up from the keyboard every book the window shows any of', () => {
    const exodusStart = range('Exod').start;
    expect(booksInView(versification, { start: 100, end: exodusStart })).toEqual(range('Gen'));
    expect(booksInView(versification, { start: 100, end: exodusStart + 0.4 })).toEqual({
      start: 0,
      end: range('Exod').end,
    });
  });

  it('taps a book to light it up, and the lit books to clear them', () => {
    const psalm = verseIndex('Ps', 23, 1);
    expect(tapBrush(versification, null, psalm)).toEqual(range('Ps'));
    const law = { start: 0, end: range('Deut').end };
    expect(tapBrush(versification, law, verseIndex('Lev', 1, 1))).toBeNull();
    expect(tapBrush(versification, law, psalm)).toEqual(range('Ps'));
  });
});

describe('naming what the strip shows', () => {
  it('names books', () => {
    expect(describeBooks(range('Ps'), versification, enBooks)).toBe('Psalms');
    expect(describeBooks({ start: 0, end: range('Deut').end }, versification, enBooks)).toBe(
      'Genesis – Deuteronomy',
    );
  });

  it('names the books a window reaches', () => {
    expect(describeView(fullView(TOTAL), versification, enBooks)).toBe('Genesis – Revelation');
    expect(
      describeView({ start: 3000, end: range('Deut').start + 50 }, versification, enBooks),
    ).toBe('Leviticus – Deuteronomy');
  });

  it('names chapters inside one book', () => {
    const psalms = (from: number, to: number) => ({
      start: verseIndex('Ps', from, 1),
      end: verseIndex('Ps', to, 1) + 1,
    });
    expect(describeView(psalms(23, 25), versification, enBooks)).toBe('Psalms 23–25');
    expect(describeView(psalms(23, 23), versification, enBooks)).toBe('Psalm 23');
    const ruth = range('Ruth');
    expect(describeView({ start: ruth.start, end: ruth.end + 1 }, versification, enBooks)).toBe(
      'Ruth',
    );
  });
});

describe('the minimap’s keys', () => {
  const view: AxisView = { start: 10_000, end: 12_000 };
  const next = (key: string) => {
    const action = minimapKeyAction(key, TOTAL);
    if (action?.kind !== 'view') throw new Error(`${key} does not move the window.`);
    return action.next(view);
  };

  it('step the window a share of itself, either way', () => {
    expect(next('ArrowRight')).toEqual({ start: 10_300, end: 12_300 });
    expect(next('ArrowDown')).toEqual({ start: 10_300, end: 12_300 });
    expect(next('ArrowLeft')).toEqual({ start: 9700, end: 11_700 });
    expect(next('ArrowUp')).toEqual({ start: 9700, end: 11_700 });
  });

  it('page by a whole window, or go to either end', () => {
    expect(next('PageDown')).toEqual({ start: 12_000, end: 14_000 });
    expect(next('PageUp')).toEqual({ start: 8000, end: 10_000 });
    expect(next('Home')).toEqual({ start: 0, end: 2000 });
    expect(next('End')).toEqual({ start: TOTAL - 2000, end: TOTAL });
  });

  it('zoom about the window’s middle, or out to the whole Bible', () => {
    for (const key of ['+', '=']) {
      const zoomed = next(key);
      expect(zoomed.end - zoomed.start).toBeCloseTo(2000 / 1.6);
      expect((zoomed.start + zoomed.end) / 2).toBeCloseTo(11_000);
    }
    for (const key of ['-', '_']) {
      const zoomed = next(key);
      expect(zoomed.end - zoomed.start).toBeCloseTo(2000 * 1.6);
    }
    expect(next('0')).toEqual(fullView(TOTAL));
  });

  it('light up the books in view, and clear them', () => {
    expect(minimapKeyAction('Enter', TOTAL)).toEqual({ kind: 'light' });
    expect(minimapKeyAction(' ', TOTAL)).toEqual({ kind: 'light' });
    expect(minimapKeyAction('Escape', TOTAL)).toEqual({ kind: 'clear' });
  });

  it('leave every other key alone', () => {
    expect(minimapKeyAction('a', TOTAL)).toBeNull();
    expect(minimapKeyAction('Tab', TOTAL)).toBeNull();
  });
});
