import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crossReferencesDatasetPath, translationDatasetPath } from '../../core/datasets/paths.ts';
import {
  createCrossReferenceColumns,
  createStudyNotesFile,
  createTranslationFile,
  PROVENANCE,
  verseIndex,
} from '../../test-utils/fixtures.ts';
import {
  originalWordsIfLoaded,
  originalWordsLoader,
  resetOriginalWords,
  resetStudyNotes,
  resetTranslation,
  resetTranslations,
  studyNotesLoader,
  translationLoader,
  vizCoreLoader,
} from './viz-data.ts';
import { vizCrossReferenceSource, vizDatasetPaths } from './viz-datasets.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);

const CROSS_REFERENCES = {
  format: 'cross-references',
  schemaVersion: 1,
  versification: 'kjv',
  provenance: PROVENANCE,
  notices: [],
  sourceId: 'openbible',
  sourceRowCount: 1,
  links: createCrossReferenceColumns([{ from: GEN_1_1, to: GEN_1_1 + 1, votes: 5 }]),
};

const WORDS = {
  format: 'original-words',
  schemaVersion: 1,
  versification: 'kjv',
  provenance: PROVENANCE,
  notices: [],
  sourceId: 'stepbible',
  license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  attribution: 'Original-language words: STEP Bible (CC BY 4.0).',
  maxVerses: 100,
  words: {
    strongs: ['H7225G'],
    lemma: ['רֵאשִׁית'],
    transliteration: ['reshit'],
    gloss: ['beginning'],
    offsets: [0, 1],
    verses: [GEN_1_1],
  },
};

/** Serves each dataset by the path it is asked for, and counts the requests. */
function serveDatasets(overrides: Record<string, unknown> = {}) {
  const fetch = vi.fn((input: string | URL) => {
    const url = String(input);
    const body = Object.entries(overrides).find(([path]) => url.includes(path))?.[1];
    if (body !== undefined) {
      return Promise.resolve(new Response(JSON.stringify(body)));
    }
    if (url.includes('cross-references')) {
      return Promise.resolve(new Response(JSON.stringify(CROSS_REFERENCES)));
    }
    if (url.includes('words')) {
      return Promise.resolve(new Response(JSON.stringify(WORDS)));
    }
    return Promise.resolve(new Response(JSON.stringify(createTranslationFile())));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  vizCoreLoader.reset();
  resetTranslations();
  resetOriginalWords();
  resetStudyNotes();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vizCoreLoader', () => {
  it('loads the links once and keeps them for every translation', async () => {
    const fetch = serveDatasets();
    const first = await vizCoreLoader.load();
    const second = await vizCoreLoader.load();
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.verseGenres).toHaveLength(first.versification.verseCount);
    expect(first.crossReferences.index.outgoing(GEN_1_1)).toHaveLength(1);
  });

  it('can be forgotten, so a failed download is tried again', async () => {
    const fetch = serveDatasets();
    await vizCoreLoader.load();
    vizCoreLoader.reset();
    await vizCoreLoader.load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('translationLoader', () => {
  it('keeps one loader per translation, so switching back costs nothing', async () => {
    const fetch = serveDatasets();
    expect(translationLoader('bsb')).toBe(translationLoader('bsb'));
    expect(translationLoader('bsb')).not.toBe(translationLoader('kjv'));
    await translationLoader('bsb').load();
    await translationLoader('bsb').load();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads the text of the translation asked for', async () => {
    serveDatasets();
    const translation = await translationLoader('bsb').load();
    expect(translation.manifest.id).toBe('bsb');
  });

  it('forgets one translation without forgetting the others', () => {
    serveDatasets();
    const bsb = translationLoader('bsb');
    const kjv = translationLoader('kjv');
    resetTranslation('bsb');
    expect(translationLoader('bsb')).not.toBe(bsb);
    expect(translationLoader('kjv')).toBe(kjv);
  });

  it('forgets every translation at once, for a retry after a failure', () => {
    const bsb = translationLoader('bsb');
    resetTranslations();
    expect(translationLoader('bsb')).not.toBe(bsb);
  });
});

describe('studyNotesLoader', () => {
  it('fetches a book’s notes once, and keeps one loader a book', async () => {
    const fetch = serveDatasets({ 'notes/net/Gen.json': createStudyNotesFile('Gen') });
    expect(studyNotesLoader('Gen')).toBe(studyNotesLoader('Gen'));
    expect(studyNotesLoader('Gen')).not.toBe(studyNotesLoader('Exod'));
    const notes = await studyNotesLoader('Gen').load();
    await studyNotesLoader('Gen').load();
    expect(notes.book).toBe('Gen');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('forgets every book after a failure, so the next one opened tries again', () => {
    const genesis = studyNotesLoader('Gen');
    resetStudyNotes();
    expect(studyNotesLoader('Gen')).not.toBe(genesis);
  });
});

describe('the original words', () => {
  it('are not there until something asks for them', () => {
    expect(originalWordsIfLoaded()).toBeNull();
  });

  it('are readable without waiting once they have arrived', async () => {
    serveDatasets();
    await originalWordsLoader.load();
    expect(originalWordsIfLoaded()?.maxVerses).toBe(100);
  });

  it('are forgotten after a failure, so the next verse opened tries again', async () => {
    const fetch = serveDatasets();
    await originalWordsLoader.load();
    resetOriginalWords();
    await originalWordsLoader.load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('vizDatasetPaths', () => {
  it('names the links and the default text, which the HTML preloads', () => {
    expect(vizDatasetPaths()).toEqual([
      translationDatasetPath('bsb'),
      crossReferencesDatasetPath(vizCrossReferenceSource().id),
    ]);
  });

  it('draws the source that is on by default', () => {
    expect(vizCrossReferenceSource().enabledByDefault).toBe(true);
  });
});
