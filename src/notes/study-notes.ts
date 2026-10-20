import type { BookId } from '../core/bible/books.ts';
import type { VerseIndex } from '../core/bible/verse-ref.ts';
import type { Versification } from '../core/bible/versification.ts';
import type {
  DatasetProvenance,
  ImportNotice,
  StudyNote,
  StudyNotesFile,
} from '../core/datasets/formats.ts';
import type { NoteText } from '../core/datasets/note-text.ts';
import { ValidationError } from '../core/lib/validation.ts';
import type { NoteSourceManifest } from './note-source-manifest.ts';

/** Every passage a note's text cites, however deep the citation sits. */
function citedPassages(text: NoteText): (readonly [VerseIndex, VerseIndex])[] {
  return text.flatMap((run) => {
    if (typeof run === 'string') return [];
    const inner = citedPassages(run.text);
    return 'passage' in run ? [run.passage, ...inner] : inner;
  });
}

/**
 * A book's study notes from one source, ready to look up by verse.
 *
 * The file's shape is checked when it is parsed; here, what the shape cannot say: that every note
 * is on a verse of its book, and every citation on verses that exist. A file that disagrees with
 * the versification is refused rather than showing notes under the wrong verse.
 */
export class BookStudyNotes {
  readonly manifest: NoteSourceManifest;
  readonly book: BookId;
  readonly provenance: DatasetProvenance;
  readonly notices: readonly ImportNotice[];
  /** The book's notes, in reading order. */
  readonly notes: readonly StudyNote[];
  readonly #byVerse: ReadonlyMap<VerseIndex, readonly StudyNote[]>;

  constructor(manifest: NoteSourceManifest, file: StudyNotesFile, versification: Versification) {
    const { start, end } = versification.bookRange(file.book);
    const byVerse = new Map<VerseIndex, StudyNote[]>();
    file.notes.forEach((note, index) => {
      const path = `notes[${String(index)}]`;
      if (note.verse < start || note.verse > end) {
        throw new ValidationError(`${path}.verse`, `${String(note.verse)} is not in ${file.book}`);
      }
      if (note.at < 0) {
        throw new ValidationError(`${path}.at`, 'a marker cannot stand before its verse');
      }
      for (const part of note.parts) {
        for (const [first, last] of citedPassages(part.text)) {
          if (!versification.isValidIndex(first) || !versification.isValidIndex(last)) {
            throw new ValidationError(path, `cites verses outside the Bible (${String(first)})`);
          }
        }
      }
      const list = byVerse.get(note.verse) ?? [];
      list.push(note);
      byVerse.set(note.verse, list);
    });
    this.manifest = manifest;
    this.book = file.book;
    this.provenance = file.provenance;
    this.notices = file.notices;
    this.notes = file.notes;
    this.#byVerse = byVerse;
  }

  /** The notes on a verse, in the order their markers stand in it. */
  notesOn(verse: VerseIndex): readonly StudyNote[] {
    return this.#byVerse.get(verse) ?? [];
  }
}
