import type { VerseIndex } from '../bible/verse-ref.ts';
import {
  expectArrayOf,
  expectIntegerArray,
  expectOneOf,
  expectRecord,
  ValidationError,
} from '../lib/validation.ts';

/**
 * The text of a study note, as a small structure rather than markup: plain strings, runs set in
 * one of a few styles, and runs that cite a passage. The app builds its own elements from it, so
 * a note can carry no script, no link to anywhere else and no style of its own, whatever the
 * source's HTML held.
 */
export const NOTE_STYLES = [
  'italic',
  'bold',
  'smallCaps',
  'superscript',
  'hebrew',
  'greek',
  'transliteration',
  /** Sigla and readings of the manuscripts a text-critical note weighs. */
  'manuscript',
] as const;
export type NoteStyle = (typeof NOTE_STYLES)[number];

export interface NoteStyledRun {
  readonly style: NoteStyle;
  readonly text: NoteText;
}

/** A citation of a passage, by its first and last verse. */
export interface NotePassageRun {
  readonly passage: readonly [VerseIndex, VerseIndex];
  readonly text: NoteText;
}

/** A run of a note's text. A line break is a `\n` inside a string. */
export type NoteRun = string | NoteStyledRun | NotePassageRun;
export type NoteText = readonly NoteRun[];

/** Deeper than any note nests (italic Hebrew inside a citation is three). */
const MAX_DEPTH = 6;

/** Validates a note's text as loaded from a dataset file. */
export function parseNoteText(value: unknown, path: string, depth = 0): NoteText {
  if (depth > MAX_DEPTH) {
    throw new ValidationError(path, `nested more than ${String(MAX_DEPTH)} deep`);
  }
  return expectArrayOf(value, path, (run, runPath) => parseNoteRun(run, runPath, depth));
}

function parseNoteRun(value: unknown, path: string, depth: number): NoteRun {
  if (typeof value === 'string') {
    return value;
  }
  const record = expectRecord(value, path);
  const text = parseNoteText(record['text'], `${path}.text`, depth + 1);
  if (record['passage'] === undefined) {
    return { style: expectOneOf(record['style'], NOTE_STYLES, `${path}.style`), text };
  }
  const passage = expectIntegerArray(record['passage'], `${path}.passage`);
  const [first, last] = passage;
  if (passage.length !== 2 || first === undefined || last === undefined || last < first) {
    throw new ValidationError(`${path}.passage`, 'expected [first verse, last verse]');
  }
  return { passage: [first, last], text };
}

/** A note's text as plain words, e.g. to search it or to read it aloud. */
export function noteTextToString(text: NoteText): string {
  return text.map((run) => (typeof run === 'string' ? run : noteTextToString(run.text))).join('');
}
