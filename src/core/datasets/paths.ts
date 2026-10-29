import type { BookId } from '../bible/books.ts';
import { DATASET_FILES } from './dataset-files.ts';
import type { CrossReferenceSourceId, NoteSourceId, TranslationId, WordSourceId } from './ids.ts';

/**
 * Location of generated dataset files, relative to the site root. The data pipeline writes them
 * under `public/`, from where they are served as static assets.
 */
export const DATASETS_DIRECTORY = 'data';

/**
 * A dataset's name: what it is, without which build of it. The file it is served from adds a hash
 * of its bytes and its format's extension (see `DATASET_FILES`).
 */
export function translationDataset(id: TranslationId): string {
  return `translations/${id}`;
}

export function crossReferencesDataset(id: CrossReferenceSourceId): string {
  return `cross-references/${id}`;
}

export function originalWordsDataset(id: WordSourceId): string {
  return `words/${id}`;
}

/** Study notes come one book to a file, so a reader downloads only the books they open. */
export function studyNotesDataset(id: NoteSourceId, book: BookId): string {
  return `notes/${id}/${book}`;
}

/** How many hex digits of a file's SHA-256 its name carries. */
export const DATASET_HASH_LENGTH = 12;

/**
 * The file a dataset is served from: its name, the first digits of the SHA-256 of its bytes, and
 * its extension. A URL therefore always means the same bytes — the server can let browsers keep
 * a copy for good, and a new build that changes a dataset moves it to a new address rather than
 * leaving an old copy in someone's cache to be read as the new one.
 */
export function datasetFileName(name: string, hash: string, extension: string): string {
  return `${name}.${hash}.${extension}`;
}

/** The dataset name a file of this build or an earlier one holds: its path without hash or extension. */
export function datasetNameOf(file: string): string {
  return file.replace(new RegExp(`(\\.[0-9a-f]{${String(DATASET_HASH_LENGTH)}})?\\.\\w+$`), '');
}

/** The served path of a dataset, relative to the site root. */
export function datasetPath(name: string): string {
  const file = DATASET_FILES[name];
  if (file === undefined) {
    throw new Error(`No file is built for the dataset "${name}". Run \`npm run data:build\`.`);
  }
  return `${DATASETS_DIRECTORY}/${file}`;
}

export function translationDatasetPath(id: TranslationId): string {
  return datasetPath(translationDataset(id));
}

export function crossReferencesDatasetPath(id: CrossReferenceSourceId): string {
  return datasetPath(crossReferencesDataset(id));
}

export function originalWordsDatasetPath(id: WordSourceId): string {
  return datasetPath(originalWordsDataset(id));
}

export function studyNotesDatasetPath(id: NoteSourceId, book: BookId): string {
  return datasetPath(studyNotesDataset(id, book));
}
