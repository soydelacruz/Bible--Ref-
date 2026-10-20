import { useEffect, useState } from 'react';
import type { BookId } from '../../core/bible/books.ts';
import type { BookStudyNotes } from '../../notes/study-notes.ts';
import { resetStudyNotes, studyNotesIfLoaded, studyNotesLoader } from './viz-data.ts';

/**
 * The NET's notes on a book, or `null` while they download (and for `null`, when nothing needs
 * them). Like the original words, they are fetched when first wanted, and a failed download is
 * forgotten so that the next verse opened asks again rather than settling it for the visit.
 */
export function useBookNotes(book: BookId | null): BookStudyNotes | null {
  const loaded = book === null ? null : studyNotesIfLoaded(book);
  const [arrived, setArrived] = useState<BookStudyNotes | null>(null);
  useEffect(() => {
    if (book === null || loaded) {
      return undefined;
    }
    let current = true;
    studyNotesLoader(book)
      .load()
      .then(
        (notes) => {
          if (current) setArrived(notes);
        },
        () => {
          resetStudyNotes();
        },
      );
    return () => {
      current = false;
    };
  }, [book, loaded]);
  return loaded ?? (arrived !== null && arrived.book === book ? arrived : null);
}
