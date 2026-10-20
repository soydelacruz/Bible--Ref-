import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import type { NoteKind, StudyNote } from '../core/datasets/formats.ts';
import { verseIndex } from '../test-utils/fixtures.ts';
import { citedPassage, notePhrases, splitAtNotes } from './note-anchors.ts';

const TEXT = 'In the beginning God created the heavens and the earth.';

const note = (number: number, at: number, kind: NoteKind = 'translation'): StudyNote => ({
  number,
  verse: 0,
  at,
  parts: [{ kind, text: ['A note.'] }],
});

describe('splitAtNotes', () => {
  it('puts each note after the words its marker follows, in the order they stand', () => {
    const [one, two, four] = [note(1, 16), note(2, 20), note(4, 55)];
    expect(splitAtNotes(TEXT, [four, two, one])).toEqual([
      { text: 'In the beginning' },
      { note: one },
      { text: ' God' },
      { note: two },
      { text: ' created the heavens and the earth.' },
      { note: four },
    ]);
  });

  it('keeps notes marked at one place together, and one past the end at the end', () => {
    const [first, second, late] = [note(1, 0), note(2, 0), note(3, 999)];
    expect(splitAtNotes('Selah.', [late, second, first])).toEqual([
      { note: first },
      { note: second },
      { text: 'Selah.' },
      { note: late },
    ]);
  });
});

describe('notePhrases', () => {
  it('names each note by the words between its marker and the one before', () => {
    const phrases = notePhrases(TEXT, [note(1, 16), note(2, 20), note(3, 28), note(4, 55)]);
    expect([...phrases]).toEqual([
      [1, 'In the beginning'],
      [2, 'God'],
      [3, 'created'],
      [4, 'the heavens and the earth'],
    ]);
  });

  it('gives notes at one place the same words, and a note before any words none', () => {
    const phrases = notePhrases(TEXT, [note(1, 0), note(2, 16), note(3, 16)]);
    expect(phrases.get(1)).toBeNull();
    expect(phrases.get(2)).toBe('In the beginning');
    expect(phrases.get(3)).toBe('In the beginning');
  });

  it('keeps the last words of a long stretch, marking what it left out', () => {
    expect(notePhrases(TEXT, [note(1, 55)]).get(1)).toBe('…created the heavens and the earth');
  });
});

describe('citedPassage', () => {
  const V = CANONICAL_VERSIFICATION;

  it('opens a verse, or the first verse of a passage', () => {
    const gen11 = verseIndex('Gen', 1, 1);
    expect(citedPassage([gen11, gen11], V)).toEqual({ kind: 'verse', verse: gen11 });
    expect(citedPassage([gen11, verseIndex('Gen', 1, 5)], V)).toEqual({
      kind: 'verse',
      verse: gen11,
    });
  });

  it('opens a chapter cited whole as the chapter', () => {
    expect(citedPassage([verseIndex('Ps', 23, 1), verseIndex('Ps', 23, 6)], V)).toEqual({
      kind: 'chapter',
      book: 'Ps',
      chapter: 23,
    });
  });
});
