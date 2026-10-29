import type { BookId } from '../core/bible/books.ts';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { parseStudyNotesFile } from '../core/datasets/formats.ts';
import { studyNotesDatasetPath } from '../core/datasets/paths.ts';
import { loadDatasetOffThread, type DatasetLoadReport } from '../shared/lib/fetch-dataset.ts';
import type { NoteSourceManifest } from './note-source-manifest.ts';
import { BookStudyNotes } from './study-notes.ts';

export interface LoadedStudyNotes {
  readonly notes: BookStudyNotes;
  readonly report: DatasetLoadReport;
}

/**
 * One book's notes from one source: a file of its own, fetched when the book is first opened, and
 * parsed in the dataset worker — the Psalms' are 1.7 MB of JSON.
 */
export async function loadStudyNotes(
  manifest: NoteSourceManifest,
  book: BookId,
): Promise<LoadedStudyNotes> {
  const expected = { id: manifest.id, versification: CANONICAL_VERSIFICATION.id, book };
  const { value: notes, report } = await loadDatasetOffThread(
    studyNotesDatasetPath(manifest.id, book),
    { kind: 'study-notes', expected },
    (value) =>
      new BookStudyNotes(manifest, parseStudyNotesFile(value, expected), CANONICAL_VERSIFICATION),
  );
  return { notes, report };
}
