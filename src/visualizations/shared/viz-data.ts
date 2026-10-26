import type { BookId } from '../../core/bible/books.ts';
import { CANONICAL_VERSIFICATION, type Versification } from '../../core/bible/versification.ts';
import type { TranslationId } from '../../core/datasets/ids.ts';
import { loadStudyNotes } from '../../notes/load-study-notes.ts';
import { getNoteSourceManifest } from '../../notes/registry.ts';
import type { BookStudyNotes } from '../../notes/study-notes.ts';
import {
  loadCrossReferences,
  type CrossReferenceDataset,
} from '../../cross-references/load-cross-references.ts';
import { createCachedLoader, type CachedLoader } from '../../shared/lib/cached-loader.ts';
import { loadTranslation } from '../../translations/load-translation.ts';
import { getTranslationManifest } from '../../translations/registry.ts';
import type { Translation } from '../../translations/translation.ts';
import type { TranslationManifest } from '../../translations/translation-manifest.ts';
import { loadOriginalWords, type OriginalWordsDataset } from '../../words/load-original-words.ts';
import { getWordSourceManifest } from '../../words/registry.ts';
import { computeVerseGenres } from './verse-genres.ts';
import { vizCrossReferenceSource } from './viz-datasets.ts';

/** What every visualization needs whichever translation is being read. */
export interface VizCore {
  readonly versification: Versification;
  readonly crossReferences: CrossReferenceDataset;
  /** Genre ordinal of every verse. */
  readonly verseGenres: Uint8Array;
}

/** The core data with the text the reader has chosen. */
export interface VizData extends VizCore {
  readonly translation: Translation;
}

/** Where the download of one translation's text stands. */
export type TextStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly translation: Translation }
  | { readonly state: 'failed'; readonly error: unknown };

/**
 * The core data and the text on its way, for a view that draws from the links alone. On a phone
 * the text arrives seconds after the links, and the arcs need none of it, so such a view shows
 * at once and only its words wait — the details panel, a word search.
 */
export interface EarlyVizData extends VizCore {
  /** The text being read, known before its words are here: for its name and its credit. */
  readonly translationManifest: TranslationManifest;
  readonly text: TextStatus;
}

let linksDownloaded = false;
const afterLinks: (() => void)[] = [];

/**
 * Runs `start` once the links' bytes are in — before they are read, which keeps a phone busy for
 * half a second or more, so a download started here uses the connection meanwhile instead of
 * after. At once if they are in already. This is when the first text starts: alongside the links,
 * it would take half of a slow connection from the download the first picture is waiting for.
 */
export function afterLinksDownloaded(start: () => void): void {
  if (linksDownloaded) {
    start();
  } else {
    afterLinks.push(start);
  }
}

/**
 * The links: by far the larger download, and the same for every translation, so it is loaded once
 * and kept while the reader switches between texts.
 */
export const vizCoreLoader = createCachedLoader(async (): Promise<VizCore> => {
  const { dataset } = await loadCrossReferences(vizCrossReferenceSource(), {
    onDownloaded: () => {
      linksDownloaded = true;
      for (const start of afterLinks.splice(0)) {
        start();
      }
    },
  });
  return {
    versification: CANONICAL_VERSIFICATION,
    crossReferences: dataset,
    verseGenres: computeVerseGenres(CANONICAL_VERSIFICATION),
  };
});

const translationLoaders = new Map<TranslationId, CachedLoader<Translation>>();

/** Each text's download, as far as it has got; a text not in here is still loading. */
const textStatuses = new Map<TranslationId, TextStatus>();
const textListeners = new Set<() => void>();
const LOADING: TextStatus = { state: 'loading' };

function settleText(id: TranslationId, status: TextStatus | null): void {
  if (status === null) {
    textStatuses.delete(id);
  } else {
    textStatuses.set(id, status);
  }
  for (const listener of textListeners) {
    listener();
  }
}

/**
 * The text of one translation. Each is downloaded the first time it is shown and then kept, so
 * switching back and forth costs nothing. The first one starts once the links are in (see
 * `src/app/main.tsx`): the links are what the first picture is drawn from, and on a slow
 * connection the two would otherwise split the bandwidth and delay it.
 */
export function translationLoader(id: TranslationId): CachedLoader<Translation> {
  const existing = translationLoaders.get(id);
  if (existing) {
    return existing;
  }
  const loader = createCachedLoader(async () => {
    try {
      const { translation } = await loadTranslation(getTranslationManifest(id));
      // Only the current attempt speaks for the text: one forgotten by a retry may still finish.
      if (translationLoaders.get(id) === loader) {
        settleText(id, { state: 'loaded', translation });
      }
      return translation;
    } catch (error) {
      if (translationLoaders.get(id) === loader) {
        settleText(id, { state: 'failed', error });
      }
      throw error;
    }
  });
  translationLoaders.set(id, loader);
  return loader;
}

/**
 * Where a text's download stands now, without waiting for it: what a view that draws before
 * the text has arrived reads. The same object until the status changes, as `useSyncExternalStore`
 * needs.
 */
export function textStatus(id: TranslationId): TextStatus {
  return textStatuses.get(id) ?? LOADING;
}

/** Calls `listener` whenever a text arrives, fails, or is forgotten; returns the unsubscribe. */
export function subscribeToTexts(listener: () => void): () => void {
  textListeners.add(listener);
  return () => {
    textListeners.delete(listener);
  };
}

/** Forgets a text, so a failed download can be tried again. */
export function resetTranslation(id: TranslationId): void {
  translationLoaders.delete(id);
  settleText(id, null);
}

/** Forgets every loaded text, so a failed download can be retried. */
export function resetTranslations(): void {
  const ids = [...textStatuses.keys()];
  translationLoaders.clear();
  textStatuses.clear();
  if (ids.length > 0) {
    for (const listener of textListeners) {
      listener();
    }
  }
}

/**
 * The words of the Hebrew and Greek. Nothing needs them until a reader opens a verse and looks
 * past its cross-references, so unlike the rest this one is fetched on first use rather than at
 * startup (see `OriginalWordsSection`).
 */
export const originalWordsLoader = createCachedLoader(async (): Promise<OriginalWordsDataset> => {
  const { dataset } = await loadOriginalWords(getWordSourceManifest('stepbible'));
  loadedOriginalWords = dataset;
  return dataset;
});

/**
 * The words once they are here, readable without waiting. The details panel is rebuilt from
 * scratch on every passage, and asking the loader again would blank the section for a frame
 * each time even though nothing needs fetching.
 */
let loadedOriginalWords: OriginalWordsDataset | null = null;

export function originalWordsIfLoaded(): OriginalWordsDataset | null {
  return loadedOriginalWords;
}

/** Forgets a failed download, so the next verse opened tries again instead of giving up. */
export function resetOriginalWords(): void {
  originalWordsLoader.reset();
}

const studyNotesLoaders = new Map<BookId, CachedLoader<BookStudyNotes>>();

/**
 * The NET's notes on one book. A book's notes are a file of their own, fetched the first time a
 * verse of it is opened and then kept; the offline cache keeps the books a reader has visited.
 */
export function studyNotesLoader(book: BookId): CachedLoader<BookStudyNotes> {
  const existing = studyNotesLoaders.get(book);
  if (existing) {
    return existing;
  }
  const loader = createCachedLoader(async () => {
    const { notes } = await loadStudyNotes(getNoteSourceManifest('net'), book);
    loadedStudyNotes.set(book, notes);
    return notes;
  });
  studyNotesLoaders.set(book, loader);
  return loader;
}

/**
 * A book's notes once they are here, readable without waiting: the panel is rebuilt for every
 * verse, and asking the loader again would blank the notes for a frame each time.
 */
const loadedStudyNotes = new Map<BookId, BookStudyNotes>();

export function studyNotesIfLoaded(book: BookId): BookStudyNotes | null {
  return loadedStudyNotes.get(book) ?? null;
}

/** Forgets every book's notes, so a failed download is tried again. */
export function resetStudyNotes(): void {
  studyNotesLoaders.clear();
  loadedStudyNotes.clear();
}
