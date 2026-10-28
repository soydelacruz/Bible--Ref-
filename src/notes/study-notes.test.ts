import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import type { StudyNote } from '../core/datasets/formats.ts';
import { studyNotesDatasetPath } from '../core/datasets/paths.ts';
import { createStudyNotesFile, verseIndex } from '../test-utils/fixtures.ts';
import { loadStudyNotes } from './load-study-notes.ts';
import { getNoteSourceManifest, NOTE_SOURCE_MANIFESTS } from './registry.ts';
import { BookStudyNotes } from './study-notes.ts';

const NET = getNoteSourceManifest('net');
const GEN_1_1 = verseIndex('Gen', 1, 1);
const GEN_1_2 = verseIndex('Gen', 1, 2);

const FIRST: StudyNote = {
  number: 1,
  verse: GEN_1_1,
  at: 16,
  parts: [{ kind: 'translation', text: ['Or “In the beginning of”.'] }],
};

const NOTES: readonly StudyNote[] = [
  FIRST,
  {
    number: 2,
    verse: GEN_1_1,
    at: 20,
    parts: [
      { kind: 'study', text: ['See ', { passage: [GEN_1_2, GEN_1_2], text: ['v. 2'] }, '.'] },
    ],
  },
  { number: 5, verse: GEN_1_2, at: 3, parts: [{ kind: 'text-critical', text: ['MT reads.'] }] },
];

const build = (notes: readonly StudyNote[], book: 'Gen' | 'Exod' = 'Gen') =>
  new BookStudyNotes(NET, createStudyNotesFile(book, notes), CANONICAL_VERSIFICATION);

describe('BookStudyNotes', () => {
  it('finds a verse’s notes in the order their markers stand', () => {
    const genesis = build(NOTES);
    expect(genesis.book).toBe('Gen');
    expect(genesis.notesOn(GEN_1_1).map((note) => note.number)).toEqual([1, 2]);
    expect(genesis.notesOn(GEN_1_2).map((note) => note.number)).toEqual([5]);
    expect(genesis.notesOn(verseIndex('Gen', 1, 3))).toEqual([]);
    expect(genesis.notes).toHaveLength(3);
  });

  it('refuses notes that would show under the wrong verse, or cite verses that do not exist', () => {
    expect(() => build(NOTES, 'Exod')).toThrow(/notes\[0\]\.verse: \d+ is not in Exod/);
    expect(() => build([{ ...FIRST, at: -1 }])).toThrow(/before its verse/);
    const citing: StudyNote = {
      ...FIRST,
      parts: [
        {
          kind: 'study',
          text: [{ style: 'italic', text: [{ passage: [0, 99_999], text: ['x'] }] }],
        },
      ],
    };
    expect(() => build([citing])).toThrow(/cites verses outside the Bible/);
  });
});

describe('the note sources', () => {
  it('mark the NET’s notes in the NET, by permission, with a credit to show', () => {
    expect(NOTE_SOURCE_MANIFESTS.map((manifest) => manifest.id)).toEqual(['net']);
    expect(NET.translationId).toBe('net');
    expect(NET.license.publicDomain).toBe(false);
    expect(NET.attribution).toContain('Biblical Studies Press');
  });
});

describe('loadStudyNotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(file: unknown) {
    const fetch = vi.fn<(input: string | URL) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(file))),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('fetches one book’s file and indexes it', async () => {
    const fetch = serve(createStudyNotesFile('Gen', NOTES));
    const { notes, report } = await loadStudyNotes(NET, 'Gen');
    expect(String(fetch.mock.calls[0]?.[0])).toContain(studyNotesDatasetPath('net', 'Gen'));
    expect(notes.notesOn(GEN_1_1)).toHaveLength(2);
    expect(report.path).toBe(studyNotesDatasetPath('net', 'Gen'));
  });

  it('refuses the file of another book', async () => {
    serve(createStudyNotesFile('Exod'));
    await expect(loadStudyNotes(NET, 'Gen')).rejects.toThrow(/book/);
  });
});
