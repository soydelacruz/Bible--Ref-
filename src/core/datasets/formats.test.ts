import { describe, expect, it } from 'vitest';
import {
  createCrossReferenceColumns,
  createStudyNotesFile,
  createTranslationFile,
} from '../../test-utils/fixtures.ts';
import {
  parseCrossReferencesFile,
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

  it('accepts a valid cross-reference file', () => {
    const file = {
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
      links: createCrossReferenceColumns([{ from: 0, to: 1, votes: 3 }], 2),
    };
    expect(
      parseCrossReferencesFile(roundTrip(file), { id: 'openbible', versification: 'kjv' }),
    ).toEqual(file);
  });

  it('rejects malformed link columns', () => {
    expect(() =>
      parseCrossReferencesFile(
        {
          format: 'cross-references',
          schemaVersion: 1,
          versification: 'kjv',
          provenance: {
            url: '',
            sha256: '',
            retrievedAt: '',
            snapshotDate: null,
          },
          notices: [],
          sourceId: 'openbible',
          sourceRowCount: 0,
          links: { offsets: [0], targetStart: [], targetEnd: [], votes: ['1'] },
        },
        { id: 'openbible', versification: 'kjv' },
      ),
    ).toThrow('links.votes[0]: expected an integer');
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
