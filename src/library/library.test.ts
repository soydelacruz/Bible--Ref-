import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { verseIndex } from '../test-utils/fixtures.ts';
import {
  EMPTY_LIBRARY,
  entryOf,
  libraryVerses,
  mergeLibraries,
  parseLibrary,
  serializeLibrary,
  updateEntry,
} from './library.ts';

const V = CANONICAL_VERSIFICATION;
const JOHN_3_16 = verseIndex('John', 3, 16);
const GEN_1_1 = verseIndex('Gen', 1, 1);

describe('the library', () => {
  it('keeps a saved verse, its colour and its note', () => {
    const library = updateEntry(
      EMPTY_LIBRARY,
      JOHN_3_16,
      { saved: true, highlight: 'yellow', note: 'Memorize' },
      100,
    );
    expect(entryOf(library, JOHN_3_16)).toEqual({
      saved: true,
      highlight: 'yellow',
      note: 'Memorize',
      updatedAt: 100,
    });
  });

  it('forgets a verse once nothing about it is kept', () => {
    const saved = updateEntry(EMPTY_LIBRARY, JOHN_3_16, { saved: true }, 1);
    const cleared = updateEntry(saved, JOHN_3_16, { saved: false }, 2);
    expect(cleared.size).toBe(0);
    expect(updateEntry(EMPTY_LIBRARY, GEN_1_1, { note: '   ' }, 1).size).toBe(0);
  });

  it('lists its verses in canonical order', () => {
    let library = updateEntry(EMPTY_LIBRARY, JOHN_3_16, { saved: true }, 1);
    library = updateEntry(library, GEN_1_1, { highlight: 'green' }, 2);
    expect(libraryVerses(library)).toEqual([GEN_1_1, JOHN_3_16]);
  });

  it('survives being written out and read back, verses named by reference', () => {
    let library = updateEntry(EMPTY_LIBRARY, JOHN_3_16, { saved: true, note: 'Gospel' }, 5);
    library = updateEntry(library, GEN_1_1, { highlight: 'blue' }, 6);
    const text = serializeLibrary(library, V);
    expect(text).toContain('"John.3.16"');
    expect(text).toContain('"Gen.1.1"');
    expect(parseLibrary(text, V)).toEqual(library);
  });

  it('reads what it can of a damaged file and leaves the rest out', () => {
    const text = JSON.stringify({
      format: 'bible-cross-references-library',
      version: 1,
      verses: {
        'John.3.16': { saved: true, highlight: 'purple', note: 7, updatedAt: 'yesterday' },
        'John.99.1': { saved: true },
        'Gen.1.1': null,
        'Rom.8.28': { highlight: 'pink', updatedAt: 3 },
      },
    });
    const library = parseLibrary(text, V);
    expect(entryOf(library, JOHN_3_16)).toEqual({
      saved: true,
      highlight: null,
      note: '',
      updatedAt: 0,
    });
    expect(entryOf(library, verseIndex('Rom', 8, 28)).highlight).toBe('pink');
    expect(library.size).toBe(2);
  });

  it.each([
    ['not JSON', 'not json'],
    ['another file', JSON.stringify({ format: 'something-else', verses: {} })],
    ['no verses', JSON.stringify({ format: 'bible-cross-references-library' })],
    ['nothing', 'null'],
  ])('reads %s as an empty library', (_name, text) => {
    expect(parseLibrary(text, V).size).toBe(0);
  });

  it('merges another copy, the change made last winning', () => {
    const here = updateEntry(EMPTY_LIBRARY, JOHN_3_16, { note: 'older' }, 1);
    const there = updateEntry(
      updateEntry(EMPTY_LIBRARY, JOHN_3_16, { note: 'newer' }, 2),
      GEN_1_1,
      { saved: true },
      2,
    );
    const merged = mergeLibraries(here, there);
    expect(entryOf(merged, JOHN_3_16).note).toBe('newer');
    expect(entryOf(merged, GEN_1_1).saved).toBe(true);
    expect(entryOf(mergeLibraries(there, here), JOHN_3_16).note).toBe('newer');
  });
});
