import { useId, useState } from 'react';
import type { Passage } from '../../../core/bible/passage.ts';
import { formatVerseIndexRange } from '../../../core/bible/reference-format.ts';
import type { VerseIndex } from '../../../core/bible/verse-ref.ts';
import {
  NOTE_KINDS,
  type NoteKind,
  type StudyNote,
  type StudyNotePart,
} from '../../../core/datasets/formats.ts';
import { noteTextToString } from '../../../core/datasets/note-text.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { citedPassage, notePhrases } from '../../../notes/note-anchors.ts';
import type { NoteSourceManifest } from '../../../notes/note-source-manifest.ts';
import { NotesIcon } from '../../../shared/ui/icons.tsx';
import { useBookNotes } from '../use-study-notes.ts';
import type { VizData } from '../viz-data.ts';
import { NoteParts, type CitationHandlers } from './NoteText.tsx';
import { PanelSection } from './PanelSection.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import styles from './PassagePanel.module.css';

/** A note longer than this (in characters) starts folded, a few lines showing. */
const LONG_NOTE = 480;

type KindFilter = 'all' | NoteKind;

function NoteItem({
  phrase,
  parts,
  lang,
  handlers,
}: {
  readonly phrase: string | null;
  readonly parts: readonly StudyNotePart[];
  /** The language of the notes, and of the translation whose words they quote. */
  readonly lang: string;
  readonly handlers: CitationHandlers;
}) {
  const { t } = useLocalization();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const long = parts.reduce((sum, part) => sum + noteTextToString(part.text).length, 0) > LONG_NOTE;
  return (
    <li className={styles.note}>
      {phrase !== null && (
        <p className={styles.notePhrase} lang={lang}>
          {phrase}
        </p>
      )}
      <div id={bodyId} className={styles.noteBody} data-folded={long && !expanded}>
        <NoteParts parts={parts} lang={lang} {...handlers} />
      </div>
      {long && (
        <button
          type="button"
          className={styles.noteMore}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {t(expanded ? 'notes.readLess' : 'notes.readAll')}
        </button>
      )}
    </li>
  );
}

/**
 * The NET translators' notes on a verse, each under the words it is about, in the order they
 * stand in the verse. Most verses have none, and then there is no section; a verse with many can
 * be narrowed to one kind of note. The notes discuss the NET's own wording, which the section says
 * when another translation is being read.
 */
export function NotesSection({
  verse,
  data,
  onSelect,
}: {
  readonly verse: VerseIndex;
  readonly data: VizData;
  readonly onSelect: (passage: Passage) => void;
}) {
  const { t, n, books } = useLocalization();
  const { versification, translation } = data;
  const bookNotes = useBookNotes(versification.bookAt(verse).id);
  const [filter, setFilter] = useState<KindFilter>('all');
  const notes: readonly StudyNote[] = bookNotes?.notesOn(verse) ?? [];
  if (!bookNotes || notes.length === 0) {
    return null;
  }

  const inNet = translation.manifest.id === bookNotes.manifest.translationId;
  // The words a note is about are the NET's: read in another translation, they are left out.
  const phrases = inNet ? notePhrases(translation.verseText(verse), notes) : null;
  const counts = new Map<NoteKind, number>(
    NOTE_KINDS.map((kind) => [
      kind,
      notes.filter((note) => note.parts.some((part) => part.kind === kind)).length,
    ]),
  );
  const kinds = NOTE_KINDS.filter((kind) => (counts.get(kind) ?? 0) > 0);
  const shown = filter === 'all' || !kinds.includes(filter) ? 'all' : filter;
  const handlers: CitationHandlers = {
    onCite: (passage) => {
      onSelect(citedPassage(passage, versification));
    },
    describe: ([first, last]) =>
      t('notes.cite')(formatVerseIndexRange(versification, books, first, last)),
  };

  return (
    <>
      <PanelSection
        id="net-notes"
        icon={NotesIcon}
        title={t('notes.title')}
        description={t('notes.note')}
        count={notes.length}
        countLabel={t('notes.counted')}
        // Folded until asked for: a verse's notes can be pages long, and they used to stand
        // between its text and every cross-reference. The band still says how many there are.
        defaultOpen={false}
      >
        {!inNet && (
          <p className={styles.notesCaveat}>
            {t('notes.otherTranslation')(translation.manifest.abbreviation)}
          </p>
        )}
        {kinds.length > 1 && (
          <div className={styles.noteKinds}>
            <SegmentedControl<KindFilter>
              label={t('notes.filter')}
              value={shown}
              onChange={setFilter}
              options={[
                { value: 'all', label: `${t('notes.all')} ${n(notes.length)}` },
                ...kinds.map((kind) => ({
                  value: kind,
                  label: `${t(`notes.kind.${kind}`)} ${n(counts.get(kind) ?? 0)}`,
                })),
              ]}
            />
          </div>
        )}
        <ol className={styles.notes}>
          {notes.map((note) => {
            const parts =
              shown === 'all' ? note.parts : note.parts.filter((part) => part.kind === shown);
            return parts.length === 0 ? null : (
              <NoteItem
                key={note.number}
                phrase={phrases?.get(note.number) ?? null}
                parts={parts}
                lang={bookNotes.manifest.language}
                handlers={handlers}
              />
            );
          })}
        </ol>
      </PanelSection>
      {/* Outside the section's body, as the credit is a condition of using the notes. */}
      <NotesCredit source={bookNotes.manifest} className={styles.credit} />
    </>
  );
}

/** The notes' credit, in the publisher's own words, with a link to them. */
export function NotesCredit({
  source,
  className,
}: {
  readonly source: NoteSourceManifest;
  readonly className: string | undefined;
}) {
  return (
    <p className={className}>
      <span lang={source.language}>{source.attribution}</span>{' '}
      <a href={source.homepage} target="_blank" rel="noreferrer">
        {new URL(source.homepage).hostname}
      </a>
    </p>
  );
}
