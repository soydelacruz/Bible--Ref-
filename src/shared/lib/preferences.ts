import { useCallback, useSyncExternalStore } from 'react';
import { preferenceKey } from './preference-keys.ts';

/**
 * Small per-reader preferences, kept in localStorage so they last between visits.
 *
 * - The origin (trekhleb.dev) is shared with other sites, so every key is namespaced.
 * - Storage can be unavailable (private browsing, blocked site data): values then live in memory
 *   for the visit.
 * - Every component using a preference sees its changes at once, including other tabs.
 */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function onStorage(): void {
  memory.clear(); // Another tab changed a preference: read it again.
  notify();
}

/**
 * One window listener for all of them, attached with the first subscriber and dropped with the
 * last. A listener each would be fine for a handful of components, but a preference read inside
 * a list item is read hundreds of times over, and the event would then cost that many listeners
 * each fanning out to that many again.
 */
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function read(key: string): string | null {
  const stored = memory.get(preferenceKey(key));
  if (stored !== undefined) {
    return stored;
  }
  try {
    return localStorage.getItem(preferenceKey(key));
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  memory.set(preferenceKey(key), value);
  try {
    localStorage.setItem(preferenceKey(key), value);
  } catch {
    // Unavailable: the value lasts for this visit only.
  }
  notify();
}

/** Reads a stored preference outside React, e.g. before the app renders. */
export function readPreference(key: string): string | null {
  return read(key);
}

/**
 * Whether anything at all is stored for this reader — a language, a translation, a saved verse, a
 * folded section: they have been here before. Only the app's own keys count; the origin is shared.
 */
export function hasStoredPreferences(): boolean {
  if (memory.size > 0) {
    return true;
  }
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      if (localStorage.key(index)?.startsWith(preferenceKey('')) === true) {
        return true;
      }
    }
  } catch {
    // Unavailable: nothing is stored, beyond what this visit keeps in memory.
  }
  return false;
}

/** Writes one outside React, e.g. to settle the language before the first paint. */
export function writePreference(key: string, value: string): void {
  write(key, value);
}

/** A stored preference, `fallback` until the reader changes it. */
export function useStringPreference(
  key: string,
  fallback: string,
): readonly [string, (value: string) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (value: string) => {
      write(key, value);
    },
    [key],
  );
  return [stored ?? fallback, set];
}

/** A yes/no preference, `fallback` until the reader changes it. */
export function useBooleanPreference(
  key: string,
  fallback: boolean,
): readonly [boolean, (value: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (value: boolean) => {
      write(key, String(value));
    },
    [key],
  );
  return [stored === null ? fallback : stored === 'true', set];
}
