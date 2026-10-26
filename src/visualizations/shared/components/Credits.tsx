import type { TranslationManifest } from '../../../translations/translation-manifest.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import styles from './Credits.module.css';

interface CreditsProps {
  /** The translation on screen, credited by its own manifest. */
  readonly translation: TranslationManifest;
  /** The work that inspired the visualization, credited by name with a link. */
  readonly inspiration?: { readonly title: string; readonly author: string; readonly url: string };
}

/**
 * Data attribution plus the visualization's inspiration.
 *
 * The links are CC BY 4.0, which asks for the creator, a link to the licence and an indication
 * that the material was changed. The creator and the licence are named at every width; the note
 * that the links were re-indexed joins them from 48rem up, and the full statement, with what the
 * change was, is in the README that the footer's source mark links to. A phone footer has room
 * for the attribution or for the background, not for both.
 *
 * The text's own credit comes from its manifest, so it follows whichever translation is read.
 * Whether a phone keeps it depends on the text: a public-domain one is a courtesy and gives way
 * to the room, while one under a licence names that licence on every copy and stays. Either way
 * the full credit, with the licence's own address, is in the picker that names the text.
 */
export function Credits({ translation, inspiration }: CreditsProps) {
  const { t } = useLocalization();
  return (
    <>
      <span className={styles.label}>{t('credits.links')} </span>
      <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noreferrer">
        OpenBible.info
      </a>{' '}
      (
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
        CC BY 4.0
      </a>
      <span className={styles.wide}>{t('credits.fromTsk')}</span>
      <span className={styles.detail}>
        {t('credits.reindexed')}
        <span className={styles.wide}>{t('credits.toKjv')}</span>
      </span>
      )
      {/* A public-domain text is credited as a courtesy, and a narrow screen may drop it; one
          under a licence names that licence wherever it is distributed, this page included. */}
      <span className={styles.text} data-optional={translation.license.publicDomain === true}>
        {' '}
        · {t('credits.text')}{' '}
        <a href={translation.homepage} target="_blank" rel="noreferrer">
          {translation.abbreviation}
        </a>{' '}
        (
        <a href={translation.license.url} target="_blank" rel="noreferrer">
          {translation.license.publicDomain === true
            ? t('license.publicDomain')
            : translation.license.name}
        </a>
        )
      </span>
      {inspiration && (
        <span className={styles.wide}>
          {' '}
          · {t('credits.inspiredBy')}{' '}
          {/* The work's own name is this app's name too, so saying it here reads as a stutter and
              costs the line the room it needs; the link, and its tooltip, still carry it. */}
          <a
            href={inspiration.url}
            target="_blank"
            rel="noreferrer"
            title={t('credits.inspiration')(inspiration.title, inspiration.author)}
          >
            {inspiration.author}
          </a>
        </span>
      )}
    </>
  );
}
