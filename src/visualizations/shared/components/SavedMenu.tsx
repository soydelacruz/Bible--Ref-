import { useRef, useState } from 'react';
import { versePassage, type Passage } from '../../../core/bible/passage.ts';
import { formatVerseRef } from '../../../core/bible/reference-format.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import {
  entryOf,
  libraryVerses,
  parseLibrary,
  serializeLibrary,
} from '../../../library/library.ts';
import { useLibrary } from '../../../library/use-library.ts';
import { ExportIcon, ImportIcon, SavedIcon } from '../../../shared/ui/icons.tsx';
import type { Translation } from '../../../translations/translation.ts';
import { verseTextOrNote } from '../../../translations/verse-text.ts';
import controls from './controls.module.css';
import { MenuButton } from './MenuButton.tsx';
import styles from './SavedMenu.module.css';
import library from './VerseLibrary.module.css';

/** The file an export is saved as. */
export const EXPORT_FILE_NAME = 'bible-cross-references-saved.json';

/** Hands text to the reader as a file. */
function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Every verse the reader has saved, highlighted or written a note on, in canonical order, each a
 * way back to the verse; and the file they can be exported to and imported from.
 */
export function SavedMenu({
  versification,
  translation,
  onSelect,
}: {
  readonly versification: Versification;
  readonly translation: Translation;
  readonly onSelect: (passage: Passage) => void;
}) {
  const { t, books, n } = useLocalization();
  const store = useLibrary(versification);
  const verses = libraryVerses(store.library);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <MenuButton
      label={t('saved.menu')}
      icon={SavedIcon}
      indicator={verses.length > 0}
      changedLabel={`${t('saved.menu')} (${n(verses.length)})`}
    >
      <p className={controls.hint}>
        {verses.length === 0 ? t('saved.empty') : t('saved.count')(n(verses.length), verses.length)}
      </p>
      {verses.length > 0 && (
        <ul className={styles.list}>
          {verses.map((verse) => {
            const entry = entryOf(store.library, verse);
            const hasNote = entry.note !== '';
            return (
              <li key={verse}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => {
                    onSelect(versePassage(verse));
                  }}
                >
                  <strong>
                    {entry.highlight !== null && (
                      <span
                        className={styles.dot}
                        data-color={entry.highlight}
                        aria-hidden="true"
                      />
                    )}
                    {formatVerseRef(versification.refAt(verse), books)}
                    {entry.saved && <SavedIcon className={styles.mark} />}
                  </strong>
                  <span
                    className={hasNote ? styles.note : library.snippet}
                    lang={hasNote ? undefined : translation.manifest.language}
                  >
                    {hasNote ? entry.note : verseTextOrNote(translation, verse)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={controls.button}
          disabled={verses.length === 0}
          onClick={() => {
            downloadText(serializeLibrary(store.library, versification), EXPORT_FILE_NAME);
          }}
        >
          <ExportIcon />
          {t('saved.export')}
        </button>
        <button
          type="button"
          className={controls.button}
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          <ImportIcon />
          {t('saved.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            void file.text().then((text) => {
              const incoming = parseLibrary(text, versification);
              if (incoming.size === 0) {
                setStatus(t('saved.importFailed'));
                return;
              }
              const count = store.merge(incoming);
              setStatus(t('saved.imported')(n(count), count));
            });
          }}
        />
      </div>
      {status !== null && (
        <p role="status" className={controls.hint}>
          {status}
        </p>
      )}
      <p className={controls.hint}>{t('saved.note')}</p>
    </MenuButton>
  );
}
