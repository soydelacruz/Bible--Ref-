import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  hasStoredPreferences,
  readPreference,
  useBooleanPreference,
  useStringPreference,
  writePreference,
} from './preferences.ts';

const KEY = 'bible-cross-references:example';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('readPreference', () => {
  it('reads a stored value, namespaced to this site', () => {
    localStorage.setItem(KEY, 'stored');
    expect(readPreference('example')).toBe('stored');
  });

  it('is null when nothing was stored', () => {
    expect(readPreference('never-set')).toBeNull();
  });

  it('is null when storage cannot be read at all', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPreference('example')).toBeNull();
  });
});

describe('useStringPreference', () => {
  it('falls back until the reader chooses', () => {
    const { result } = renderHook(() => useStringPreference('example', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('keeps what was chosen, and writes it through', () => {
    const { result } = renderHook(() => useStringPreference('example', 'fallback'));
    act(() => {
      result.current[1]('chosen');
    });
    expect(result.current[0]).toBe('chosen');
    expect(localStorage.getItem(KEY)).toBe('chosen');
  });

  it('tells every component at once', () => {
    const one = renderHook(() => useStringPreference('example', 'fallback'));
    const two = renderHook(() => useStringPreference('example', 'fallback'));
    act(() => {
      one.result.current[1]('shared');
    });
    expect(two.result.current[0]).toBe('shared');
  });

  it('lasts the visit even when storage refuses to keep it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useStringPreference('example', 'fallback'));
    act(() => {
      result.current[1]('in memory');
    });
    expect(result.current[0]).toBe('in memory');
  });

  it('picks up a change made in another tab', () => {
    const { result } = renderHook(() => useStringPreference('example', 'fallback'));
    act(() => {
      localStorage.setItem(KEY, 'from the other tab');
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current[0]).toBe('from the other tab');
  });

  it('stops listening once nothing uses it', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    renderHook(() => useStringPreference('example', 'fallback')).unmount();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});

describe('useBooleanPreference', () => {
  it('falls back when nothing is stored', () => {
    expect(renderHook(() => useBooleanPreference('example', true)).result.current[0]).toBe(true);
    expect(renderHook(() => useBooleanPreference('example', false)).result.current[0]).toBe(false);
  });

  it('reads and writes the two values', () => {
    const { result } = renderHook(() => useBooleanPreference('example', true));
    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('treats anything that is not "true" as false', () => {
    // Its own key: the module keeps what it has already read for the life of the page.
    localStorage.setItem('bible-cross-references:tri-state', 'yes');
    expect(renderHook(() => useBooleanPreference('tri-state', true)).result.current[0]).toBe(false);
  });

  it('serves a value it has already read without going back to storage', () => {
    const { result } = renderHook(() => useBooleanPreference('example', true));
    act(() => {
      result.current[1](false);
    });
    const get = vi.spyOn(Storage.prototype, 'getItem');
    expect(renderHook(() => useBooleanPreference('example', true)).result.current[0]).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('hasStoredPreferences', () => {
  /**
   * Forgets what the module keeps in memory, as a change in another tab does. It hears other tabs
   * only while something reads a preference, so something does, for the moment.
   */
  const forget = () => {
    const { unmount } = renderHook(() => useStringPreference('example', 'fallback'));
    window.dispatchEvent(new StorageEvent('storage'));
    unmount();
  };

  it('is false for a reader with nothing stored, whatever other sites keep here', () => {
    forget();
    localStorage.setItem('another-site:theme', 'dark');
    expect(hasStoredPreferences()).toBe(false);
  });

  it('is true once anything of the app is stored, from an earlier visit or this one', () => {
    forget();
    localStorage.setItem(KEY, 'stored');
    expect(hasStoredPreferences()).toBe(true);
    localStorage.clear();
    writePreference('example', 'this visit');
    expect(hasStoredPreferences()).toBe(true);
  });

  it('is false when storage cannot be read at all and nothing was kept this visit', () => {
    localStorage.setItem(KEY, 'stored');
    forget();
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new Error('blocked');
      },
    });
    expect(hasStoredPreferences()).toBe(false);
    vi.unstubAllGlobals();
  });
});
