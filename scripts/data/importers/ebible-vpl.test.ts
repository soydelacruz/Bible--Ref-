import { describe, expect, it } from 'vitest';
import { BOOKS } from '../../../src/core/bible/books.ts';
import { KJV_CHAPTER_VERSE_COUNTS } from '../../../src/core/bible/kjv-versification.ts';
import { PROVENANCE, verseIndex } from '../../../src/test-utils/fixtures.ts';
import { BOOK_CODES, importEbibleVerseLines } from './ebible-vpl.ts';

/** Builds a complete eBible-style file; `transform` may rewrite or drop (return `null`) lines. */
function createVerseLines(transform: (line: string) => string | null = (line) => line): string {
  const lines = BOOKS.flatMap((book, bookIndex) =>
    KJV_CHAPTER_VERSE_COUNTS[book.id].flatMap((verseCount, chapterOffset) =>
      Array.from({ length: verseCount }, (_, verseOffset) => {
        const reference = `${BOOK_CODES[bookIndex] ?? ''} ${chapterOffset + 1}:${verseOffset + 1}`;
        return transform(`${reference} Text of ${reference}.`);
      }),
    ),
  ).filter((line) => line !== null);
  return ['﻿' + lines.join('\r\n'), ''].join('\r\n');
}

describe('importEbibleVerseLines', () => {
  it('imports every verse in canonical order', () => {
    const file = importEbibleVerseLines(createVerseLines(), 'kjv', PROVENANCE);
    expect(file).toMatchObject({
      format: 'translation-text',
      translationId: 'kjv',
      versification: 'kjv',
      provenance: PROVENANCE,
      notices: [],
    });
    expect(file.verses).toHaveLength(31102);
    expect(file.verses[0]).toBe('Text of GEN 1:1.');
    expect(file.verses[verseIndex('Ps', 23, 1)]).toBe('Text of PSA 23:1.');
    expect(file.verses.at(-1)).toBe('Text of REV 22:21.');
  });

  it('drops a pilcrow, which is only a paragraph mark', () => {
    const file = importEbibleVerseLines(
      createVerseLines((line) =>
        line.startsWith('GEN 1:1 ') ? 'GEN 1:1 ¶ In the beginning was the Word.' : line,
      ),
      'kjv',
      PROVENANCE,
    );
    expect(file.verses[0]).toBe('In the beginning was the Word.');
  });

  it('keeps the brackets around words the translators supplied', () => {
    const file = importEbibleVerseLines(
      createVerseLines((line) =>
        line.startsWith('GEN 1:1 ') ? 'GEN 1:1 ¶ In the beginning [was] the Word.' : line,
      ),
      'kjv',
      PROVENANCE,
    );
    // They mark the difference between what the source says and what English needed added, which
    // is the translators' own statement about their work and not ours to drop.
    expect(file.verses[0]).toBe('In the beginning [was] the Word.');
  });

  /**
   * Colon spacing. The Bíblia Livre sets a psalm's superscription against its first words with
   * no space, and removing the brackets around a stanza heading leaves the space on the wrong
   * side of the colon. Both read as mistakes and neither is about the wording, so the colon
   * keeps its place and only the space moves — which is a claim the attribution makes to
   * readers, and so one worth holding to.
   */
  describe('colon spacing', () => {
    const clean = (text: string) =>
      importEbibleVerseLines(
        createVerseLines((line) => (line.startsWith('GEN 1:1 ') ? `GEN 1:1 ${text}` : line)),
        'kjv',
        PROVENANCE,
      ).verses[0];

    it('puts a space after a colon that runs into the next word', () => {
      expect(clean('Salmo de Davi:Ah SENHOR')).toBe('Salmo de Davi: Ah SENHOR');
    });

    it('moves a space that sits before a colon, brackets and all', () => {
      expect(clean('[Guímel] :Trata bem')).toBe('[Guímel]: Trata bem');
    });

    it('leaves a colon that is already spaced exactly as it is', () => {
      expect(clean('E disse Deus: Haja luz')).toBe('E disse Deus: Haja luz');
    });

    it('never touches a colon before a digit, so a time or a reference survives', () => {
      expect(clean('às 3:16 da tarde')).toBe('às 3:16 da tarde');
    });

    it('never touches a colon before a bracket, which the KJV uses forty times', () => {
      expect(clean('among their enemies:)')).toBe('among their enemies:)');
      expect(clean('Olha isto:(diz ele')).toBe('Olha isto:(diz ele');
    });

    it('moves spaces and nothing else: no word is added, dropped or reordered', () => {
      const source = 'Ela :Beije-me:com beijos:(assim) 1:2';
      const cleaned = clean(source) ?? '';
      const strip = (text: string) => text.replace(/\s+/g, '');
      expect(strip(cleaned)).toBe(strip(source));
    });
  });

  it('keeps omitted verses as empty text and reports them', () => {
    const file = importEbibleVerseLines(
      createVerseLines((line) => (line.startsWith('MAT 17:21 ') ? 'MAT 17:21' : line)),
      'kjv',
      PROVENANCE,
    );
    expect(file.verses[verseIndex('Matt', 17, 21)]).toBe('');
    expect(file.notices).toEqual([
      expect.objectContaining({ level: 'info', count: 1, examples: ['Matt.17.21'] }),
    ]);
  });

  /**
   * The World English Bible ends Romans 14 with the doxology the KJV prints as 16:25–27, and leaves
   * 16:25 blank where it moved from: eBible's file has 14:24–26 and an empty 16:25, but no 16:26
   * or 16:27.
   */
  describe('the World English Bible’s numbering', () => {
    const webLines = (line: string): string | null => {
      if (line.startsWith('ROM 14:23 ')) {
        return [line, 'ROM 14:24 Now to him', 'ROM 14:25 but now', 'ROM 14:26 to God'].join('\r\n');
      }
      if (line.startsWith('ROM 16:25 ')) {
        return 'ROM 16:25 ';
      }
      if (line.startsWith('ROM 16:26 ') || line.startsWith('ROM 16:27 ')) {
        return null;
      }
      return line.startsWith('ACT 8:37 ') ? 'ACT 8:37 ' : line;
    };

    it('puts the doxology back where the KJV numbers it', () => {
      const file = importEbibleVerseLines(createVerseLines(webLines), 'web', PROVENANCE);
      expect(file.verses).toHaveLength(31102);
      expect(file.verses[verseIndex('Rom', 14, 23)]).toBe('Text of ROM 14:23.');
      expect(file.verses[verseIndex('Rom', 16, 25)]).toBe('Now to him');
      expect(file.verses[verseIndex('Rom', 16, 26)]).toBe('but now');
      expect(file.verses[verseIndex('Rom', 16, 27)]).toBe('to God');
    });

    it('reports the verses it omits, but not the blank the move left behind', () => {
      const file = importEbibleVerseLines(createVerseLines(webLines), 'web', PROVENANCE);
      expect(file.notices).toEqual([
        expect.objectContaining({ level: 'info', count: 1, examples: ['Acts.8.37'] }),
      ]);
    });

    it('moves nothing for a translation that numbers like the KJV', () => {
      expect(() => importEbibleVerseLines(createVerseLines(webLines), 'asv', PROVENANCE)).toThrow(
        'Rom.14.24 is not in the KJV versification',
      );
    });

    it('still refuses a second text for a verse a move fills', () => {
      const text = createVerseLines((line) =>
        line.startsWith('ROM 14:23 ') ? [line, 'ROM 14:24 Now to him'].join('\r\n') : line,
      );
      expect(() => importEbibleVerseLines(text, 'web', PROVENANCE)).toThrow(
        'duplicate verse Rom.16.25',
      );
    });
  });

  it.each([
    [
      'an unknown book code',
      (text: string) => text.replace('GEN 1:1 ', 'GENESIS 1:1 '),
      'unknown book code "GENESIS"',
    ],
    [
      'a verse outside the versification',
      (text: string) => text.replace('GEN 1:1 ', 'GEN 1:99 '),
      'Gen.1.99 is not in the KJV versification',
    ],
    [
      'a duplicate verse',
      (text: string) => text.replace('GEN 1:2 ', 'GEN 1:1 '),
      'duplicate verse Gen.1.1',
    ],
    [
      'a malformed line',
      (text: string) => text.replace('GEN 1:1 ', 'GEN 1-1 '),
      'unrecognized format',
    ],
  ])('rejects %s', (_, corrupt, message) => {
    expect(() => importEbibleVerseLines(corrupt(createVerseLines()), 'kjv', PROVENANCE)).toThrow(
      message,
    );
  });

  it('rejects incomplete text', () => {
    const text = createVerseLines((line) => (line.startsWith('JUD 1:') ? null : line));
    expect(() => importEbibleVerseLines(text, 'kjv', PROVENANCE)).toThrow(
      '25 verses are missing, e.g. Jude.1.1',
    );
  });
});
