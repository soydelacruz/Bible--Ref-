import { describe, expect, it } from 'vitest';
import { BOOKS } from '../bible/books.ts';
import { DATASET_FILES } from './dataset-files.ts';
import { CROSS_REFERENCE_SOURCE_IDS, TRANSLATION_IDS } from './ids.ts';
import {
  crossReferencesDatasetPath,
  datasetFileName,
  datasetNameOf,
  datasetPath,
  originalWordsDatasetPath,
  studyNotesDatasetPath,
  translationDatasetPath,
} from './paths.ts';

describe('dataset paths', () => {
  it('name every file by its content, under data/', () => {
    const paths = [
      ...TRANSLATION_IDS.map(translationDatasetPath),
      ...CROSS_REFERENCE_SOURCE_IDS.map(crossReferencesDatasetPath),
      originalWordsDatasetPath('stepbible'),
      ...BOOKS.map(({ id }) => studyNotesDatasetPath('net', id)),
    ];
    expect(paths).toHaveLength(Object.keys(DATASET_FILES).length);
    for (const path of paths) {
      expect(path).toMatch(/^data\/[\w/-]+\.[0-9a-f]{12}\.(json|bin)$/);
    }
    expect(translationDatasetPath('kjv')).toMatch(/^data\/translations\/kjv\./);
    expect(crossReferencesDatasetPath('openbible')).toMatch(/\.bin$/);
  });

  it('refuse a dataset nothing was built for, rather than guess at a file', () => {
    expect(() => datasetPath('translations/klingon')).toThrow(
      'No file is built for the dataset "translations/klingon"',
    );
  });

  it('read a dataset’s name back from any release’s file for it', () => {
    const file = datasetFileName('translations/kjv', '1a2b3c4d5e6f', 'json');
    expect(file).toBe('translations/kjv.1a2b3c4d5e6f.json');
    expect(datasetNameOf(file)).toBe('translations/kjv');
    // As an earlier release named it, before names carried a hash.
    expect(datasetNameOf('translations/kjv.json')).toBe('translations/kjv');
    expect(datasetNameOf('notes/net/1John.0123456789ab.json')).toBe('notes/net/1John');
  });
});
