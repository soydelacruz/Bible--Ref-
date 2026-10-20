import { versePassage, type Passage } from '../core/bible/passage.ts';
import type { VerseIndex } from '../core/bible/verse-ref.ts';
import type { Versification } from '../core/bible/versification.ts';
import type { StudyNote } from '../core/datasets/formats.ts';

/** A verse's text cut where its notes are marked: runs of words, and the notes between them. */
export type VerseSegment = { readonly text: string } | { readonly note: StudyNote };

/** In the order a reader meets them: by place in the verse, then as the NET numbers them. */
function byPlace(notes: readonly StudyNote[]): StudyNote[] {
  return notes.toSorted((a, b) => a.at - b.at || a.number - b.number);
}

/** The verse's text with each note in its place, as a reader meets them. */
export function splitAtNotes(text: string, notes: readonly StudyNote[]): VerseSegment[] {
  const segments: VerseSegment[] = [];
  let from = 0;
  for (const note of byPlace(notes)) {
    const at = Math.min(Math.max(note.at, from), text.length);
    if (at > from) {
      segments.push({ text: text.slice(from, at) });
    }
    segments.push({ note });
    from = at;
  }
  if (from < text.length) {
    segments.push({ text: text.slice(from) });
  }
  return segments;
}

/** The longest phrase a note is introduced by; a longer one keeps its last words. */
const MAX_PHRASE_WORDS = 6;
const EDGE_PUNCTUATION = /^[\s“”‘’"'(),.;:!?—–-]+|[\s“”‘’"'(),.;:!?—–-]+$/gu;

/**
 * The words each note is about: those between the marker before it (or the start of the verse)
 * and its own, as the NET's translators set their markers after the words they comment on. Notes
 * marked at one place share their words; a note marked before any word (on a heading, say) has
 * none.
 */
export function notePhrases(text: string, notes: readonly StudyNote[]): Map<number, string | null> {
  const phrases = new Map<number, string | null>();
  let from = 0;
  let lastAt = -1;
  let lastPhrase: string | null = null;
  for (const note of byPlace(notes)) {
    if (note.at !== lastAt) {
      const words: string[] = text
        .slice(from, note.at)
        .replace(EDGE_PUNCTUATION, '')
        .split(/\s+/)
        .filter((word) => word !== '');
      const kept = words.slice(-MAX_PHRASE_WORDS).join(' ');
      lastPhrase = words.length === 0 ? null : words.length > MAX_PHRASE_WORDS ? `…${kept}` : kept;
      lastAt = note.at;
      from = Math.max(from, note.at);
    }
    phrases.set(note.number, lastPhrase);
  }
  return phrases;
}

/** Where a citation in a note leads: its chapter when it cites one whole, else its first verse. */
export function citedPassage(
  [first, last]: readonly [VerseIndex, VerseIndex],
  versification: Versification,
): Passage {
  const { book, chapter } = versification.refAt(first);
  const range = versification.chapterRange(book, chapter);
  if (first !== last && range?.start === first && range.end === last) {
    return { kind: 'chapter', book, chapter };
  }
  return versePassage(first);
}
