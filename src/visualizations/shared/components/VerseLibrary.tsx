import { useId } from 'react';
import type { VerseIndex } from '../../../core/bible/verse-ref.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { entryOf, HIGHLIGHT_COLORS } from '../../../library/library.ts';
import { useLibrary } from '../../../library/use-library.ts';
import { NoHighlightIcon, SaveIcon, SavedIcon } from '../../../shared/ui/icons.tsx';
import controls from './controls.module.css';
import styles from './VerseLibrary.module.css';

/**
 * What a reader keeps of a verse: whether it is saved, the colour it is marked with, and a note.
 * Every change is kept on the device at once; there is nothing to submit.
 */
export function VerseLibrary({
  verse,
  versification,
}: {
  readonly verse: VerseIndex;
  readonly versification: Versification;
}) {
  const { t } = useLocalization();
  const { library, update } = useLibrary(versification);
  const entry = entryOf(library, verse);
  const noteId = useId();
  const highlightId = useId();
  return (
    <div className={styles.library}>
      <div className={styles.row}>
        <button
          type="button"
          className={controls.button}
          aria-pressed={entry.saved}
          onClick={() => {
            update(verse, { saved: !entry.saved });
          }}
        >
          {entry.saved ? <SavedIcon /> : <SaveIcon />}
          {entry.saved ? t('library.saved') : t('library.save')}
        </button>
        {/* Named on screen, not only for a screen reader: four plain circles read as decoration. */}
        <div role="group" aria-labelledby={highlightId} className={styles.swatches}>
          <span id={highlightId} className={styles.label}>
            {t('library.highlights')}
          </span>
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.swatch}
              data-color={color}
              aria-pressed={entry.highlight === color}
              aria-label={t(`library.highlight.${color}`)}
              title={t(`library.highlight.${color}`)}
              onClick={() => {
                update(verse, { highlight: entry.highlight === color ? null : color });
              }}
            />
          ))}
          {entry.highlight !== null && (
            <button
              type="button"
              className={styles.swatch}
              aria-label={t('library.highlight.none')}
              title={t('library.highlight.none')}
              onClick={() => {
                update(verse, { highlight: null });
              }}
            >
              <NoHighlightIcon />
            </button>
          )}
        </div>
      </div>
      <label htmlFor={noteId} className={styles.label}>
        {t('library.note')}
      </label>
      <textarea
        id={noteId}
        className={styles.note}
        rows={entry.note === '' ? 1 : 3}
        placeholder={t('library.note.placeholder')}
        value={entry.note}
        onChange={(event) => {
          update(verse, { note: event.target.value });
        }}
      />
    </div>
  );
}
