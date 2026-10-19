import { useCallback, useMemo } from 'react';
import type { VerseIndex } from '../core/bible/verse-ref.ts';
import type { Versification } from '../core/bible/versification.ts';
import { useStringPreference } from '../shared/lib/preferences.ts';
import {
  mergeLibraries,
  parseLibrary,
  serializeLibrary,
  updateEntry,
  type Library,
  type VerseEntry,
} from './library.ts';

/** Where the library is kept on the reader's device. */
export const LIBRARY_PREFERENCE = 'library';

export interface LibraryStore {
  readonly library: Library;
  readonly update: (verse: VerseIndex, change: Partial<Omit<VerseEntry, 'updatedAt'>>) => void;
  /** Adds an imported library; returns how many verses it brought. */
  readonly merge: (incoming: Library) => number;
}

/**
 * The reader's saved verses, highlights and notes, on this device only. Kept with the other
 * preferences, so every part of the app — and every other open tab — sees a change at once.
 */
export function useLibrary(versification: Versification): LibraryStore {
  const [stored, store] = useStringPreference(LIBRARY_PREFERENCE, '');
  const library = useMemo(() => parseLibrary(stored, versification), [stored, versification]);
  const save = useCallback(
    (next: Library) => {
      store(serializeLibrary(next, versification));
    },
    [store, versification],
  );
  const update = useCallback<LibraryStore['update']>(
    (verse, change) => {
      save(updateEntry(library, verse, change, Date.now()));
    },
    [library, save],
  );
  const merge = useCallback<LibraryStore['merge']>(
    (incoming) => {
      save(mergeLibraries(library, incoming));
      return incoming.size;
    },
    [library, save],
  );
  return { library, update, merge };
}
