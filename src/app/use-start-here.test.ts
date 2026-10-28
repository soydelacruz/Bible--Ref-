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

const FRONT = { view: 'arcs', passage: null, filter: DEFAULT_LINK_FILTER } as const;
type Whereabouts = Parameters<typeof useStartHere>[0];

/** A visit that begins somewhere, the front page by default, and can then go elsewhere. */
function visit(whereabouts: Whereabouts = FRONT) {
  return renderHook(
    (props: { whereabouts: Whereabouts }) => useStartHere(props.whereabouts, 'arcs'),
    {
      initialProps: { whereabouts },
    },
  );
}

beforeEach(() => {
  forgetPreferences();
});

afterEach(() => {
  localStorage.clear();
});

describe('isFrontPage', () => {
  it('is the home view with nothing open and the default links', () => {
    expect(isFrontPage(FRONT, 'arcs')).toBe(true);
  });

  it('is not another view, a passage, or another filter', () => {
    expect(isFrontPage({ ...FRONT, view: 'threads' }, 'arcs')).toBe(false);
    expect(isFrontPage({ ...FRONT, passage: GEN_1_1 }, 'arcs')).toBe(false);
    expect(isFrontPage({ ...FRONT, filter: createLinkFilter(50) }, 'arcs')).toBe(false);
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

  it.each([
    ['a passage', { ...FRONT, passage: GEN_1_1 }],
    ['another view', { ...FRONT, view: 'threads' }],
  ])('is gone for good once the reader opens %s', (_, elsewhere) => {
    const { result, rerender, unmount } = visit();
    rerender({ whereabouts: elsewhere });
    expect(result.current.shown).toBe(false);
    rerender({ whereabouts: FRONT });
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBe('closed');
    unmount();
    expect(visit().result.current.shown).toBe(false);
  });

  it('stays while the reader tries the filters, which leave them on the front page', () => {
    const { result, rerender } = visit();
    rerender({ whereabouts: { ...FRONT, filter: createLinkFilter(50) } });
    expect(result.current.shown).toBe(true);
    expect(localStorage.getItem(STORED)).toBe('open');
  });

  it.each([
    ['a passage', { ...FRONT, passage: GEN_1_1 }],
    ['another view', { ...FRONT, view: 'threads' }],
    ['a filter', { ...FRONT, filter: createLinkFilter(50) }],
  ])('does not welcome a link to %s, even once the reader is on the front page', (_, link) => {
    const { result, rerender } = visit(link);
    rerender({ whereabouts: FRONT });
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
    const { result } = visit({ ...FRONT, passage: GEN_1_1 });
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(STORED)).toBe('closed');
  });
});
