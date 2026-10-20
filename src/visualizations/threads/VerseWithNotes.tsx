import type { StudyNote } from '../../core/datasets/formats.ts';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { splitAtNotes } from '../../notes/note-anchors.ts';
import { CloseIcon } from '../../shared/ui/icons.tsx';
import type { NoteSourceManifest } from '../../notes/note-source-manifest.ts';
import { NoteParts, type CitationHandlers } from '../shared/components/NoteText.tsx';
import { NotesCredit } from '../shared/components/NotesSection.tsx';
import styles from './ThreadsStage.module.css';

/**
 * A verse of the NET with a mark after each set of words its translators wrote a note on. A mark
 * is small and quiet, so the verse still reads as a verse; its shape says what kind of note it
 * is (see ThreadsStage.module.css), and its name says it in words, with the words it is about.
 */
export function VerseWithNotes({
  text,
  notes,
  phrases,
  openNumber,
  noteId,
  onToggle,
}: {
  readonly text: string;
  readonly notes: readonly StudyNote[];
  readonly phrases: ReadonlyMap<number, string | null>;
  /** The note shown under the verse, if any. */
  readonly openNumber: number | null;
  readonly noteId: string;
  readonly onToggle: (note: StudyNote) => void;
}) {
  const { t } = useLocalization();
  return (
    <>
      {splitAtNotes(text, notes).map((segment, index) => {
        if ('text' in segment) {
          return <span key={`text.${String(index)}`}>{segment.text}</span>;
        }
        const { note } = segment;
        const kind = note.parts[0]?.kind ?? 'translation';
        const open = note.number === openNumber;
        return (
          <button
            key={`note.${String(note.number)}`}
            type="button"
            className={styles.noteMarker}
            data-kind={kind}
            aria-label={t('notes.marker')(t(`notes.kind.${kind}`), phrases.get(note.number) ?? '')}
            aria-expanded={open}
            aria-controls={open ? noteId : undefined}
            onClick={(event) => {
              // The verse itself selects on a click; a mark only opens its note.
              event.stopPropagation();
              onToggle(note);
            }}
          />
        );
      })}
    </>
  );
}

/** A note opened from its mark, under the verse it belongs to, the threads beside it untouched. */
export function InlineNote({
  id,
  note,
  phrase,
  source,
  handlers,
  onClose,
}: {
  readonly id: string;
  readonly note: StudyNote;
  readonly phrase: string | null;
  /** Whose note it is: its language, and the credit that goes wherever its text is shown. */
  readonly source: NoteSourceManifest;
  readonly handlers: CitationHandlers;
  readonly onClose: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div
      id={id}
      className={styles.inlineNote}
      // A click inside the note is about the note: it must not select or unselect the verse.
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className={styles.inlineNoteHeader}>
        {phrase !== null && (
          <p className={styles.inlineNotePhrase} lang={source.language}>
            {phrase}
          </p>
        )}
        <button
          type="button"
          className={styles.inlineNoteClose}
          aria-label={t('notes.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <NoteParts parts={note.parts} lang={source.language} {...handlers} />
      <NotesCredit source={source} className={styles.inlineNoteCredit} />
    </div>
  );
}
