import { useEffect, useId, useMemo, useState, useSyncExternalStore, type SubmitEvent } from 'react';
import {
  formatPassage,
  passageFromReference,
  passageRange,
  versePassage,
  type Passage,
} from '../../../core/bible/passage.ts';
import { formatVerseRef } from '../../../core/bible/reference-format.ts';
import { parseReference } from '../../../core/bible/reference-parse.ts';
import { describeReferenceError } from '../../../i18n/describe-reference-error.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { CloseIcon, ExpandIcon, PathIcon, PlayIcon } from '../../../shared/ui/icons.tsx';
import { verseTextOrNote } from '../../../translations/verse-text.ts';
import { findConnectionPath, type PathStep } from '../connection-path.ts';
import type { LinkFilter } from '../link-filter.ts';
import { isLit, type LitSteps, type PathLight } from '../path-light.ts';
import type { VizData } from '../viz-data.ts';
import controls from './controls.module.css';
import { PanelSection } from './PanelSection.tsx';
import panel from './PassagePanel.module.css';
import styles from './PathSection.module.css';

interface PathSectionProps {
  readonly data: VizData;
  readonly passage: Passage;
  readonly filter: LinkFilter;
  /**
   * Where the path leads. It belongs to the panel rather than to this section, so that following
   * a step keeps it: the path is then drawn again from the step, and each click is one link closer.
   */
  readonly destination: Passage | null;
  readonly onDestinationChange: (destination: Passage | null) => void;
  readonly onSelect: (passage: Passage) => void;
  /** Where the chain is drawn on the visualization beside the panel, if it draws one. */
  readonly light?: PathLight | undefined;
}

/**
 * The shortest chain of cross-references from this passage to another one the reader names, e.g.
 * Genesis 3:15 to Revelation 12:9, through the links the filters show.
 */
export function PathSection({
  data,
  passage,
  filter,
  destination,
  onDestinationChange,
  onSelect,
  light,
}: PathSectionProps) {
  const localization = useLocalization();
  const { t, books } = localization;
  const { versification, crossReferences, verseGenres } = data;
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const path = useMemo(
    () =>
      destination &&
      findConnectionPath(
        crossReferences.index,
        passageRange(passage, versification),
        passageRange(destination, versification),
        filter,
        verseGenres,
      ),
    [crossReferences.index, passage, destination, versification, filter, verseGenres],
  );
  // The chain travels the picture as light once, when it appears, and is taken off it when it
  // goes: another destination, a step followed (the chain is then found again from there), the
  // panel closed.
  const chain = path && path.length > 1 ? path : null;
  useEffect(() => {
    light?.show(chain);
  }, [light, chain]);
  useEffect(
    () => () => {
      light?.show(null);
    },
    [light],
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = new FormData(event.currentTarget).get('destination');
    const result = parseReference(typeof input === 'string' ? input : '', versification, books);
    if (!result.ok) {
      setError(describeReferenceError(result.error, localization));
      // The path below would otherwise still answer the last question, under a message about
      // this one, and read as the answer to it.
      onDestinationChange(null);
      return;
    }
    setError(null);
    onDestinationChange(passageFromReference(result.reference, versification));
  };

  return (
    <PanelSection id="path" icon={PathIcon} title={t('path.title')} description={t('path.note')}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          name="destination"
          type="text"
          className={controls.input}
          placeholder={t('path.placeholder')}
          aria-label={t('path.label')}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          autoComplete="off"
          // As in the search box: a bound on what a paste can hand the reference parser.
          maxLength={120}
          enterKeyHint="go"
          onChange={() => {
            setError(null);
          }}
        />
        <button type="submit" className={controls.button}>
          {t('path.find')}
        </button>
      </form>
      {error !== null && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {destination !== null && (
        <div className={styles.result}>
          <p className={panel.muted} role="status">
            {path === null
              ? t('path.none')(formatPassage(destination, versification, books))
              : path.length === 1
                ? t('path.arrived')(formatPassage(destination, versification, books))
                : t('path.summary')(
                    formatPassage(passage, versification, books),
                    formatPassage(destination, versification, books),
                    localization.n(path.length - 1),
                    path.length - 1,
                  )}
          </p>
          {chain && <PathSteps steps={chain} data={data} light={light} onSelect={onSelect} />}
          <div className={styles.actions}>
            {chain && light && (
              <button
                type="button"
                className={panel.more}
                title={t('path.replay.hint')}
                onClick={() => {
                  light.replay();
                }}
              >
                <PlayIcon />
                {t('path.replay')}
              </button>
            )}
            <button
              type="button"
              className={panel.more}
              onClick={() => {
                onDestinationChange(null);
              }}
            >
              <CloseIcon />
              {t('path.clear')}
            </button>
          </div>
        </div>
      )}
    </PanelSection>
  );
}

/** A panel whose view draws no path: nothing is ever lit. */
const UNLIT = {
  subscribe: () => () => undefined,
  lit: (): LitSteps | null => null,
};

function PathSteps({
  steps,
  data,
  light,
  onSelect,
}: {
  readonly steps: readonly PathStep[];
  readonly data: VizData;
  readonly light: PathLight | undefined;
  readonly onSelect: (passage: Passage) => void;
}) {
  const { t, books, n } = useLocalization();
  const { versification, translation } = data;
  const { subscribe, lit } = light ?? UNLIT;
  // The step the light is heading for on the picture, as it travels there; all of them at once
  // for a reader who asked for less motion.
  const litSteps = useSyncExternalStore(subscribe, lit);
  return (
    <ol className={styles.steps}>
      {steps.map(({ verse, hop }, position) => (
        <li key={verse} data-lit={isLit(litSteps, position) || undefined}>
          {hop !== null && (
            <p className={styles.hop}>
              <ExpandIcon />
              {t(hop.direction === 'outgoing' ? 'path.references' : 'path.referencedBy')} ·{' '}
              {t('path.votes')(n(hop.votes), hop.votes)}
            </p>
          )}
          <button
            type="button"
            className={panel.item}
            onClick={() => {
              onSelect(versePassage(verse));
            }}
          >
            <span className={panel.itemRef}>
              <strong>{formatVerseRef(versification.refAt(verse), books)}</strong>
            </span>
            <span
              className={panel.snippet}
              lang={translation.manifest.language}
              dir={translation.manifest.direction}
            >
              {verseTextOrNote(translation, verse)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
