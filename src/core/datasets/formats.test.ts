import { describe, expect, it } from 'vitest';
import { createStudyNotesFile, createTranslationFile } from '../../test-utils/fixtures.ts';
import {
  compareLinksInVerse,
  parseCrossReferencesMetadata,
  parseStudyNotesFile,
  parseTranslationTextFile,
} from './formats.ts';

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('dataset file parsing', () => {
  it('accepts a valid translation file', () => {
    const file = createTranslationFile();
    expect(parseTranslationTextFile(roundTrip(file), { id: 'bsb', versification: 'kjv' })).toEqual(
      file,
    );
  });

  it('rejects files from another schema version', () => {
    const file = { ...createTranslationFile(), schemaVersion: 2 };
    expect(() =>
      parseTranslationTextFile(roundTrip(file), { id: 'bsb', versification: 'kjv' }),
    ).toThrow('schemaVersion: expected one of 1, got 2');
  });

  it("accepts a cross-reference file's metadata", () => {
    const metadata = {
      format: 'cross-references',
      schemaVersion: 1,
      versification: 'kjv',
      provenance: {
        url: 'https://example.org',
        sha256: 'a'.repeat(64),
        retrievedAt: '2026-01-01',
        snapshotDate: '2026-01-01',
      },
      notices: [{ level: 'info', message: 'Remapped', count: 1, examples: ['x'] }],
      sourceId: 'openbible',
      sourceRowCount: 1,
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'OpenBible.info',
    };
    expect(
      parseCrossReferencesMetadata(roundTrip(metadata), { id: 'openbible', versification: 'kjv' }),
    ).toEqual(metadata);
  });

  it("refuses another source's cross-references", () => {
    expect(() =>
      parseCrossReferencesMetadata(
        {
          format: 'cross-references',
          schemaVersion: 1,
          versification: 'kjv',
          provenance: { url: '', sha256: '', retrievedAt: '', snapshotDate: null },
          notices: [],
          sourceId: 'elsewhere',
          sourceRowCount: 0,
        },
        { id: 'openbible', versification: 'kjv' },
      ),
    ).toThrow('sourceId: expected one of "openbible", got "elsewhere"');
  });
});

describe("a verse's links", () => {
  it('come most votes first, then by where they point', () => {
    const links = [
      { targetStart: 9, targetEnd: 9, votes: 1 },
      { targetStart: 4, targetEnd: 6, votes: 7 },
      { targetStart: 4, targetEnd: 4, votes: 7 },
      { targetStart: 2, targetEnd: 2, votes: 7 },
    ];
    expect(links.toSorted(compareLinksInVerse)).toEqual([
      { targetStart: 2, targetEnd: 2, votes: 7 },
      { targetStart: 4, targetEnd: 4, votes: 7 },
      { targetStart: 4, targetEnd: 6, votes: 7 },
      { targetStart: 9, targetEnd: 9, votes: 1 },
    ]);
  });
});

describe('study notes files', () => {
  const note = {
    number: 1,
    verse: 0,
    at: 16,
    parts: [{ kind: 'translation', text: ['Or ', { style: 'italic', text: ['sky'] }, '.'] }],
  };

  it('accepts a book of notes', () => {
    const file = createStudyNotesFile('Gen', [note] as never);
    expect(
      parseStudyNotesFile(roundTrip(file), { id: 'net', versification: 'kjv', book: 'Gen' }),
    ).toEqual(file);
  });

  it('refuses another book’s notes, a kind it does not know, and markup in place of text', () => {
    const expected = { id: 'net', versification: 'kjv', book: 'Exod' } as const;
    expect(() => parseStudyNotesFile(roundTrip(createStudyNotesFile('Gen')), expected)).toThrow(
      'book: expected one of "Exod", got "Gen"',
    );
    const withKind = createStudyNotesFile('Gen', [
      { ...note, parts: [{ kind: 'gossip', text: [] }] },
    ] as never);
    expect(() => parseStudyNotesFile(roundTrip(withKind), { ...expected, book: 'Gen' })).toThrow(
      'notes[0].parts[0].kind',
    );
    const withMarkup = createStudyNotesFile('Gen', [
      { ...note, parts: [{ kind: 'study', text: [{ html: '<script>' }] }] },
    ] as never);
    expect(() => parseStudyNotesFile(roundTrip(withMarkup), { ...expected, book: 'Gen' })).toThrow(
      'notes[0].parts[0].text[0]',
    );
  });
});
