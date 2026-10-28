import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Passage } from '../core/bible/passage.ts';
import {
  ARCS_TOUR_PREFERENCE,
  LOCALE_PREFERENCE,
  preferenceKey,
  START_HERE_PREFERENCE,
} from '../shared/lib/preference-keys.ts';
import { useStringPreference } from '../shared/lib/preferences.ts';
import { verseIndex } from '../test-utils/fixtures.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../visualizations/shared/link-filter.ts';
import { isFrontPage, useStartHere } from './use-start-here.ts';

const STORED = preferenceKey(START_HERE_PREFERENCE);
const GEN_1_1: Passage = { kind: 'verse', verse: verseIndex('Gen', 1, 1) };

/**
 * Forgets what the preferences module keeps in memory, as a change in another tab does. It hears
 * other tabs only while something reads a preference, so something does, for the moment.
 */
function forgetPreferences() {
  const { unmount } = renderHook(() => useStringPreference(START_HERE_PREFERENCE, ''));
  act(() => {
    window.dispatchEvent(new StorageEvent('storage'));
  });
  unmount();
}

/** A visit that begins at the front page or not, and can then go elsewhere. */
function visit(atFrontPage = true) {
  return renderHook((props: { atFrontPage: boolean }) => useStartHere(props.atFrontPage), {
    initialProps: { atFrontPage },
  });
}

beforeEach(() => {
  forgetPreferences();
});

afterEach(() => {
  localStorage.clear();
});

describe('isFrontPage', () => {
  const front = { view: 'arcs', passage: null, filter: DEFAULT_LINK_FILTER };

  it('is the home view with nothing open and the default links', () => {
    expect(isFrontPage(front, 'arcs')).toBe(true);
  });

  it('is not another view, a passage, or another filter', () => {
    expect(isFrontPage({ ...front, view: 'threads' }, 'arcs')).toBe(false);
    expect(isFrontPage({ ...front, passage: GEN_1_1 }, 'arcs')).toBe(false);
    expect(isFrontPage({ ...front, filter: createLinkFilter(50) }, 'arcs')).toBe(false);
  });
});

describe('useStartHere', () => {
  it('welcomes a first visit, and offers the tour in place of its own invitation', () => {
    const { result } = visit();
    expect(result.current.shown).toBe(true);
    expect(localStorage.getItem(STORED)).toBe('open');
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBe('true');
  });

  it('stays across reloads until it is closed, and then never shows again', () => {
    visit().unmount();
    const reloaded = visit();
    expect(reloaded.result.current.shown).toBe(true);
    act(() => {
      reloaded.result.current.close();
    });
    expect(reloaded.result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBe('closed');
    reloaded.unmount();
    expect(visit().result.current.shown).toBe(false);
  });

  it('is gone for good once the reader goes anywhere from the front page', () => {
    const { result, rerender, unmount } = visit();
    rerender({ atFrontPage: false });
    expect(result.current.shown).toBe(false);
    rerender({ atFrontPage: true });
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBe('closed');
    unmount();
    expect(visit().result.current.shown).toBe(false);
  });

  it('does not welcome a link to somewhere in particular, even once the reader is back', () => {
    const { result, rerender } = visit(false);
    rerender({ atFrontPage: true });
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBeNull();
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBeNull();
  });

  it('does not welcome a reader who has been here before', () => {
    localStorage.setItem(preferenceKey(LOCALE_PREFERENCE), 'pt');
    expect(visit().result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBeNull();
  });

  it('is put away by a link elsewhere, if it was still open from an earlier visit', () => {
    localStorage.setItem(STORED, 'open');
    const { result } = visit(false);
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBe('closed');
  });
});
