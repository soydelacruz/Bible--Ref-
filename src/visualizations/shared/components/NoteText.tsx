import { Fragment, type ReactNode } from 'react';
import type { VerseIndex } from '../../../core/bible/verse-ref.ts';
import type { StudyNotePart } from '../../../core/datasets/formats.ts';
import type { NoteStyle, NoteText } from '../../../core/datasets/note-text.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import styles from './notes.module.css';

type Passage = readonly [VerseIndex, VerseIndex];

export interface CitationHandlers {
  /** Opens a passage a note cites; without it, citations are plain text. */
  readonly onCite?: (passage: Passage) => void;
  /** Names a cited passage for a reader who cannot see the note's own words around it. */
  readonly describe: (passage: Passage) => string;
}

function lines(text: string, key: string): ReactNode {
  const parts = text.split('\n');
  return parts.map((line, index) => (
    <Fragment key={`${key}.${String(index)}`}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

function styled(style: NoteStyle, children: ReactNode, key: string): ReactNode {
  switch (style) {
    case 'italic':
      return <i key={key}>{children}</i>;
    case 'bold':
      return <b key={key}>{children}</b>;
    case 'superscript':
      return <sup key={key}>{children}</sup>;
    case 'smallCaps':
      return (
        <span key={key} className={styles.smallCaps}>
          {children}
        </span>
      );
    case 'hebrew':
      return (
        <span key={key} lang="he" dir="rtl" className={styles.hebrew}>
          {children}
        </span>
      );
    case 'greek':
      return (
        <span key={key} lang="grc" className={styles.greek}>
          {children}
        </span>
      );
    case 'transliteration':
      return (
        <i key={key} className={styles.transliteration}>
          {children}
        </i>
      );
    case 'manuscript':
      return (
        <span key={key} className={styles.manuscript}>
          {children}
        </span>
      );
  }
}

function runs(text: NoteText, handlers: CitationHandlers, key: string): ReactNode[] {
  return text.map((run, index) => {
    const runKey = `${key}.${String(index)}`;
    if (typeof run === 'string') {
      return lines(run, runKey);
    }
    const children = runs(run.text, handlers, runKey);
    if ('passage' in run) {
      const { onCite } = handlers;
      return onCite ? (
        <button
          key={runKey}
          type="button"
          className={styles.citation}
          aria-label={handlers.describe(run.passage)}
          onClick={(event) => {
            event.stopPropagation();
            onCite(run.passage);
          }}
        >
          {children}
        </button>
      ) : (
        <Fragment key={runKey}>{children}</Fragment>
      );
    }
    return styled(run.style, children, runKey);
  });
}

/** A note's text, built from its structure: no markup from the source reaches the page. */
export function NoteTextView({
  text,
  ...handlers
}: { readonly text: NoteText } & CitationHandlers) {
  return <>{runs(text, handlers, 'run')}</>;
}

/** A note's parts, each under the name of its kind: a translator's note, a study note… */
export function NoteParts({
  parts,
  ...handlers
}: { readonly parts: readonly StudyNotePart[] } & CitationHandlers) {
  const { t } = useLocalization();
  return (
    <>
      {parts.map((part, index) => (
        <p key={index} className={styles.part}>
          <span className={styles.kind}>{t(`notes.kind.${part.kind}`)}</span>{' '}
          <NoteTextView text={part.text} {...handlers} />
        </p>
      ))}
    </>
  );
}
