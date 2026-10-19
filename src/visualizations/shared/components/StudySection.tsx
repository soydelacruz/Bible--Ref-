import { formatPassage, type Passage } from '../../../core/bible/passage.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { ExternalLinkIcon, StudyIcon } from '../../../shared/ui/icons.tsx';
import { studyLinks, type StudyReference } from '../study-links.ts';
import { PanelSection } from './PanelSection.tsx';
import styles from './PassagePanel.module.css';

function referenceOf(passage: Passage, versification: Versification): StudyReference {
  return passage.kind === 'verse'
    ? versification.refAt(passage.verse)
    : { book: passage.book, chapter: passage.chapter };
}

/**
 * The passage on study sites elsewhere: the NET Bible's translators' notes first, then lexicons,
 * interlinears and commentaries. Links and nothing more — their text is theirs, and some of it
 * (the NET's notes) may not be copied — so each opens the site itself, in a new tab, leaving the
 * reader's place here as it was.
 */
export function StudySection({
  passage,
  versification,
}: {
  readonly passage: Passage;
  readonly versification: Versification;
}) {
  const { t, books } = useLocalization();
  const name = formatPassage(passage, versification, books);
  return (
    <PanelSection
      id="study"
      icon={StudyIcon}
      title={t('study.title')}
      description={t('study.note')}
    >
      <ul className={styles.studyLinks}>
        {studyLinks(referenceOf(passage, versification)).map(({ site, url }) => (
          <li key={site}>
            <a
              className={`${styles.item} ${styles.studyLink}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('study.label')(t(`study.${site}`), name)}
            >
              <span className={styles.itemRef}>
                {t(`study.${site}`)}
                <ExternalLinkIcon className={styles.studyLinkIcon} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}
