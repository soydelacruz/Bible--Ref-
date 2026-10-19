import { toOsisId, parseOsisId, type VerseIndex } from '../core/bible/verse-ref.ts';
import type { Versification } from '../core/bible/versification.ts';

/** The colours a verse can be marked with. */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** What a reader has kept of one verse. */
export interface VerseEntry {
  readonly saved: boolean;
  readonly highlight: HighlightColor | null;
  readonly note: string;
  /** When it last changed (ms since the epoch): on import, the newer of two copies wins. */
  readonly updatedAt: number;
}

/** A reader's saved verses, highlights and notes, by verse. Verses with nothing kept are absent. */
export type Library = ReadonlyMap<VerseIndex, VerseEntry>;

export const EMPTY_LIBRARY: Library = new Map();

/**
 * The file a library is stored and exported as. Verses are named by their OSIS ID rather than
 * their index, so the file means the same thing to a person reading it and to a later version of
 * the app.
 */
interface LibraryFile {
  readonly format: typeof FORMAT;
  readonly version: 1;
  readonly verses: Readonly<Record<string, VerseEntry>>;
}

const FORMAT = 'bible-cross-references-library';

function isHighlight(value: unknown): value is HighlightColor {
  return HIGHLIGHT_COLORS.some((color) => color === value);
}

function readEntry(value: unknown): VerseEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { saved, highlight, note, updatedAt } = value as Record<string, unknown>;
  const entry: VerseEntry = {
    saved: saved === true,
    highlight: isHighlight(highlight) ? highlight : null,
    note: typeof note === 'string' ? note : '',
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0,
  };
  return isEmpty(entry) ? null : entry;
}

function isEmpty(entry: VerseEntry): boolean {
  return !entry.saved && entry.highlight === null && entry.note.trim() === '';
}

/**
 * Reads a stored or imported library. Anything it cannot place — another file, a verse that does
 * not exist, a field of the wrong kind — is left out rather than failing the rest: a reader's
 * notes are worth more than the parts of them that went wrong.
 */
export function parseLibrary(text: string, versification: Versification): Library {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return EMPTY_LIBRARY;
  }
  if (
    typeof file !== 'object' ||
    file === null ||
    (file as Record<string, unknown>)['format'] !== FORMAT
  ) {
    return EMPTY_LIBRARY;
  }
  const verses = (file as Record<string, unknown>)['verses'];
  if (typeof verses !== 'object' || verses === null) {
    return EMPTY_LIBRARY;
  }
  const library = new Map<VerseIndex, VerseEntry>();
  for (const [id, value] of Object.entries(verses)) {
    const ref = parseOsisId(id);
    const verse = ref && versification.indexOf(ref);
    const entry = readEntry(value);
    if (verse !== undefined && entry !== null) {
      library.set(verse, entry);
    }
  }
  return library;
}

/** The library as the file it is stored and exported as, verses in canonical order. */
export function serializeLibrary(library: Library, versification: Versification): string {
  const verses: Record<string, VerseEntry> = {};
  for (const verse of libraryVerses(library)) {
    const entry = library.get(verse);
    if (entry) {
      verses[toOsisId(versification.refAt(verse))] = entry;
    }
  }
  const file: LibraryFile = { format: FORMAT, version: 1, verses };
  return JSON.stringify(file, null, 2);
}

/** What a verse has, or an empty entry. */
export function entryOf(library: Library, verse: VerseIndex): VerseEntry {
  return library.get(verse) ?? { saved: false, highlight: null, note: '', updatedAt: 0 };
}

/** The library with one verse changed; a verse left with nothing kept is dropped. */
export function updateEntry(
  library: Library,
  verse: VerseIndex,
  change: Partial<Omit<VerseEntry, 'updatedAt'>>,
  now: number,
): Library {
  const next = new Map(library);
  const entry: VerseEntry = { ...entryOf(library, verse), ...change, updatedAt: now };
  if (isEmpty(entry)) {
    next.delete(verse);
  } else {
    next.set(verse, entry);
  }
  return next;
}

/**
 * Two libraries as one, e.g. an exported file brought onto another device: where both have a
 * verse, the copy changed last wins.
 */
export function mergeLibraries(current: Library, incoming: Library): Library {
  const merged = new Map(current);
  for (const [verse, entry] of incoming) {
    const existing = merged.get(verse);
    if (!existing || entry.updatedAt > existing.updatedAt) {
      merged.set(verse, entry);
    }
  }
  return merged;
}

/** The verses the library holds, in canonical order. */
export function libraryVerses(library: Library): VerseIndex[] {
  return [...library.keys()].sort((a, b) => a - b);
}
