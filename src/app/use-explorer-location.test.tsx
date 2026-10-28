import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { versePassage } from '../core/bible/passage.ts';
import { KJV_VERSIFICATION } from '../core/bible/versification.ts';
import { DEFAULT_TRANSLATION_ID } from '../translations/registry.ts';
import { DEFAULT_LINK_FILTER, createLinkFilter } from '../visualizations/shared/link-filter.ts';
import type { ViewRoute } from './explorer-location.ts';
import { useExplorerLocation } from './use-explorer-location.ts';

const ROUTES: readonly [ViewRoute<'arcs'>, ViewRoute<'threads'>] = [
  { id: 'arcs', path: '' },
  { id: 'threads', path: 'threads/' },
];
const BASE = import.meta.env.BASE_URL;
const JOHN_3_16 = versePassage(
  KJV_VERSIFICATION.indexOf({ book: 'John', chapter: 3, verse: 16 }) ?? 0,
);
const PS_23_1 = versePassage(KJV_VERSIFICATION.indexOf({ book: 'Ps', chapter: 23, verse: 1 }) ?? 0);

function useLocation() {
  return useExplorerLocation(ROUTES, KJV_VERSIFICATION, () => DEFAULT_TRANSLATION_ID, 'en');
}

beforeEach(() => {
  window.history.replaceState(null, '', BASE);
});

afterEach(() => {
  window.history.replaceState(null, '', BASE);
});

describe('useExplorerLocation', () => {
  it('reads the opening location out of the address', () => {
    window.history.replaceState(null, '', `${BASE}?ref=John.3.16`);
    const { result } = renderHook(useLocation);
    expect(result.current[0].view).toBe('arcs');
    expect(result.current[0].passage).toEqual(JOHN_3_16);
  });

  it('reads the view from the path', () => {
    window.history.replaceState(null, '', `${BASE}threads/?ref=John.3.16`);
    expect(renderHook(useLocation).result.current[0].view).toBe('threads');
  });

  it('writes a new passage into the address, as a history entry', () => {
    const { result } = renderHook(useLocation);
    const before = window.history.length;
    act(() => {
      result.current[1]({ ...result.current[0], passage: PS_23_1 });
    });
    expect(window.location.search).toContain('ref=Ps.23.1');
    expect(result.current[0].passage).toEqual(PS_23_1);
    expect(window.history.length).toBeGreaterThanOrEqual(before);
  });

  it('replaces the entry for a change that is not worth a Back step', () => {
    const { result } = renderHook(useLocation);
    act(() => {
      result.current[1]({ ...result.current[0], filter: createLinkFilter(20) }, { replace: true });
    });
    expect(window.location.search).toContain('votes=20');
  });

  it('writes nothing when the address already says it', () => {
    window.history.replaceState(null, '', `${BASE}?ref=John.3.16`);
    const { result } = renderHook(useLocation);
    const before = window.location.href;
    act(() => {
      result.current[1](result.current[0]);
    });
    expect(window.location.href).toBe(before);
  });

  it('switches view by path, keeping the passage', () => {
    window.history.replaceState(null, '', `${BASE}?ref=John.3.16`);
    const { result } = renderHook(useLocation);
    act(() => {
      result.current[1]({ ...result.current[0], view: 'threads' });
    });
    expect(window.location.pathname).toContain('threads/');
    expect(window.location.search).toContain('ref=John.3.16');
  });

  it('follows the Back button', () => {
    const { result } = renderHook(useLocation);
    act(() => {
      result.current[1]({ ...result.current[0], passage: PS_23_1 });
    });
    expect(result.current[0].passage).toEqual(PS_23_1);

    act(() => {
      window.history.replaceState(null, '', `${BASE}?ref=John.3.16`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0].passage).toEqual(JOHN_3_16);
  });

  it('lets the host show a step through the history its own way', () => {
    window.history.replaceState(null, '', `${BASE}?ref=John.3.16`);
    const showStep = vi.fn();
    const { result } = renderHook(() =>
      useExplorerLocation(ROUTES, KJV_VERSIFICATION, () => DEFAULT_TRANSLATION_ID, 'en', showStep),
    );
    const before = result.current[0];

    const event = new PopStateEvent('popstate');
    act(() => {
      window.history.replaceState(null, '', `${BASE}threads/?ref=John.3.16`);
      window.dispatchEvent(event);
    });
    // Nothing changes until the host shows it.
    expect(result.current[0]).toBe(before);
    const [previous, next, show, received] = showStep.mock.lastCall as [
      typeof before,
      typeof before,
      () => void,
      PopStateEvent,
    ];
    expect(previous).toBe(before);
    expect(next.view).toBe('threads');
    expect(next.passage).toEqual(JOHN_3_16);
    expect(received).toBe(event);

    act(show);
    expect(result.current[0].view).toBe('threads');
  });

  it('stops following it once unmounted', () => {
    const { result, unmount } = renderHook(useLocation);
    const last = result.current[0];
    unmount();
    window.history.replaceState(null, '', `${BASE}?ref=Ps.23.1`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(result.current[0]).toBe(last);
  });

  it('keeps the default filter out of the address', () => {
    const { result } = renderHook(useLocation);
    act(() => {
      result.current[1]({ ...result.current[0], filter: DEFAULT_LINK_FILTER });
    });
    expect(window.location.search).not.toContain('votes=');
  });
});
