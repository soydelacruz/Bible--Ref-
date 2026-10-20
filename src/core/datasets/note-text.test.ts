import { describe, expect, it } from 'vitest';
import { noteTextToString, parseNoteText } from './note-text.ts';

const TEXT = [
  'See ',
  { passage: [0, 2], text: ['Gen 1:1–3'] },
  ', where ',
  { style: 'hebrew', text: [{ style: 'italic', text: ['רֵאשִׁית'] }] },
  ' begins.\nNext line.',
];

describe('parseNoteText', () => {
  it('accepts strings, styled runs and citations, however they nest', () => {
    expect(parseNoteText(TEXT, 'text')).toEqual(TEXT);
  });

  it('refuses a style it does not know, which could carry markup of its own', () => {
    expect(() => parseNoteText([{ style: 'script', text: ['x'] }], 'text')).toThrow(
      /text\[0\]\.style/,
    );
  });

  it('refuses a citation that is not a first and a last verse', () => {
    expect(() => parseNoteText([{ passage: [1, 2, 3], text: [] }], 'text')).toThrow(
      /first verse, last verse/,
    );
    expect(() => parseNoteText([{ passage: [5, 2], text: [] }], 'text')).toThrow(
      /first verse, last verse/,
    );
  });

  it('refuses runs that are neither strings nor records, and nesting with no end', () => {
    expect(() => parseNoteText([42], 'text')).toThrow(/text\[0\]/);
    let deep: unknown = ['x'];
    for (let level = 0; level < 10; level += 1) {
      deep = [{ style: 'italic', text: deep }];
    }
    expect(() => parseNoteText(deep, 'text')).toThrow(/nested more than 6 deep/);
  });
});

describe('noteTextToString', () => {
  it('reads a note as plain words', () => {
    expect(noteTextToString(parseNoteText(TEXT, 'text'))).toBe(
      'See Gen 1:1–3, where רֵאשִׁית begins.\nNext line.',
    );
  });
});
