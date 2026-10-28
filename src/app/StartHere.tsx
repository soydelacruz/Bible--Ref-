import { useId, useRef } from 'react';
import { formatPassage, versePassage, type Passage } from '../core/bible/passage.ts';
import type { Versification } from '../core/bible/versification.ts';
import { useLocalization } from '../i18n/use-locale.tsx';
import { CloseIcon, PlayIcon, type IconComponent } from '../shared/ui/icons.tsx';
import { startArcsTour, useArcsTourAvailable } from '../visualizations/arcs/tour/tour-request.ts';
import controls from '../visualizations/shared/components/controls.module.css';
import { focusPassageTitle } from '../visualizations/shared/panel-focus.ts';
import { InAppLink } from './InAppLink.tsx';
import styles from './StartHere.module.css';
import { VIEWS, type View } from './views.ts';

const [ARCS, THREADS] = VIEWS;
/** The best-known verse, and the best-known chapter, each in the view that suits it. */
const JOHN_3_16 = { book: 'John', chapter: 3, verse: 16 } as const;
const PSALM_23: Passage = { kind: 'chapter', book: 'Ps', chapter: 23 };

interface StartHereProps {
  readonly versification: Versification;
  /** Where a way in leads: a real link, so it can be opened in a new tab or copied. */
  readonly hrefOf: (view: View, passage: Passage) => string;
  /** Follows a way in, in place. */
  readonly onOpen: (view: View, passage: Passage) => void;
  /** Puts the strip away for good. */
  readonly onClose: () => void;
}

/**
 * The first visit's welcome, in a row of its own under the header (see `useStartHere`): one line
 * on what the picture is, and three ways in — a verse in the arcs, a chapter in the threads, and
 * the arcs' tour. It never lies over the stage, so the arcs stay whole and in reach under it.
 */
export function StartHere({ versification, hrefOf, onOpen, onClose }: StartHereProps) {
  const { t, books } = useLocalization();
  const labelId = useId();
  const stripRef = useRef<HTMLElement>(null);
  // A filter can hide every stop of the tour; it is then not offered here either.
  const tourAvailable = useArcsTourAvailable();
  const verse = versification.indexOf(JOHN_3_16);
  const ways: { readonly view: View; readonly passage: Passage; readonly where: string }[] = [
    ...(verse === undefined
      ? []
      : [{ view: ARCS, passage: versePassage(verse), where: t('start.inArcs') }]),
    { view: THREADS, passage: PSALM_23, where: t('start.inThreads') },
  ];

  // The strip goes with its buttons: keys go on to the arcs under it, where the reader is.
  const close = () => {
    const strip = stripRef.current;
    if (strip?.contains(document.activeElement) === true) {
      stageUnder(strip)?.focus({ preventScroll: true });
    }
    onClose();
  };

  return (
    <section ref={stripRef} className={styles.strip} aria-labelledby={labelId}>
      <p className={styles.caption}>{t('start.caption')}</p>
      <div className={styles.ways}>
        <h2 id={labelId} className={styles.label}>
          {t('start.label')}
        </h2>
        <ul className={styles.list}>
          {ways.map(({ view, passage, where }) => (
            <li key={view.id}>
              <InAppLink
                href={hrefOf(view, passage)}
                className={`${controls.button} ${styles.way}`}
                onFollow={() => {
                  // Where a panel opens on the passage, it takes the keys, as after a search.
                  focusPassageTitle(document.activeElement);
                  onOpen(view, passage);
                }}
              >
                <Way
                  icon={view.icon}
                  name={formatPassage(passage, versification, books)}
                  detail={where}
                />
              </InAppLink>
            </li>
          ))}
          {tourAvailable && (
            <li>
              <button
                type="button"
                className={`${controls.button} ${styles.way}`}
                onClick={() => {
                  // The tour's card takes the keys as it opens.
                  startArcsTour();
                  onClose();
                }}
              >
                <Way icon={PlayIcon} name={t('start.tour')} detail={t('start.tourLength')} />
              </button>
            </li>
          )}
        </ul>
      </div>
      <button
        type="button"
        className={`${controls.button} ${styles.close}`}
        aria-label={t('start.close')}
        title={t('start.close')}
        onClick={close}
      >
        <CloseIcon />
      </button>
    </section>
  );
}

/** What takes the keys on the stage of the page the strip heads: the arcs, on the front page. */
function stageUnder(strip: HTMLElement): HTMLElement | null {
  for (let scope = strip.parentElement; scope !== null; scope = scope.parentElement) {
    const stage = scope.querySelector('main');
    if (stage) {
      return stage.querySelector<HTMLElement>('[tabindex="0"]');
    }
  }
  return null;
}

/** A way in: what it opens, and where or how long — "John 3:16 in Arcs", "The tour in 45 seconds". */
function Way({
  icon: Icon,
  name,
  detail,
}: {
  readonly icon: IconComponent;
  readonly name: string;
  readonly detail: string;
}) {
  return (
    <>
      <Icon />
      <span className={styles.words}>
        <span className={styles.name}>{name}</span> <span className={styles.detail}>{detail}</span>
      </span>
    </>
  );
}
