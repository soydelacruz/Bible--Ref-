import type { BookId } from '../core/bible/books.ts';
import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { parseStudyNotesFile } from '../core/datasets/formats.ts';
import { studyNotesDatasetPath } from '../core/datasets/paths.ts';
import { loadDataset, type DatasetLoadReport } from '../shared/lib/fetch-dataset.ts';
import type { NoteSourceManifest } from './note-source-manifest.ts';
import { BookStudyNotes } from './study-notes.ts';

export interface LoadedStudyNotes {
  readonly notes: BookStudyNotes;
  readonly report: DatasetLoadReport;
}

/** One book's notes from one source: a file of its own, fetched when the book is first opened. */
export async function loadStudyNotes(
  manifest: NoteSourceManifest,
  book: BookId,
): Promise<LoadedStudyNotes> {
  const { value: notes, report } = await loadDataset(
    studyNotesDatasetPath(manifest.id, book),
    (json) => {
      const file = parseStudyNotesFile(json, {
        id: manifest.id,
        versification: CANONICAL_VERSIFICATION.id,
        book,
      });
      return new BookStudyNotes(manifest, file, CANONICAL_VERSIFICATION);
    },
  );
  return { notes, report };
}
