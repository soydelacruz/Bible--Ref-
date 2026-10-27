import { Fragment, useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { formatPassage, versePassage, type Passage } from '../../../core/bible/passage.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import type { BookNames } from '../../../i18n/books/types.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { CloseIcon, PauseIcon, PlayIcon } from '../../../shared/ui/icons.tsx';
import controls from '../../shared/components/controls.module.css';
import { useAnnouncer } from '../../shared/use-announcer.ts';
import { useElementSize } from '../../shared/use-element-size.ts';
import { computeArcLayout } from '../arc-layout.ts';
import type { TourPlan } from './tour-plan.ts';
import type { TourRun } from './use-arcs-tour.ts';
import styles from './ArcsTour.module.css';

/** What a card says: the stop's title and line, and the passages it joins. */
interface CardWords {
  readonly title: string;
  readonly line: string;
  readonly passages: readonly string[];
}

function useCardWords(plan: TourPlan, card: number, versification: Versification): CardWords {
  const { t, books } = useLocalization();
  const stop = plan.stops[card];
  if (stop) {
    return {
      title: t(`tour.stop.${stop.key}.title`),
      line: t(`tour.stop.${stop.key}.line`),
      passages: named([stop.passage, stop.answer], versification, books),
    };
  }
  return {
    title: t('tour.finale.title'),
    line: t('tour.finale.line'),
    passages: named(
      (plan.finale ?? []).map((step) => versePassage(step.verse)),
      versification,
      books,
    ),
  };
}

function named(passages: readonly Passage[], versification: Versification, books: BookNames) {
  return passages.map((passage) => formatPassage(passage, versification, books));
}

/** Passages in the order the links join them; a line breaks between them, never inside one. */
function Chain({ passages }: { readonly passages: readonly string[] }) {
  return passages.map((passage, index) => (
    <Fragment key={index}>
      {index > 0 && ' → '}
      <span className={styles.passage}>{passage}</span>
    </Fragment>
  ));
}

/** How the reader steers the tour from its cards (see `useArcsTour`). */
export interface TourControls {
  readonly onStart: () => void;
  readonly onDismiss: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onClose: () => void;
}

interface TourLayerProps extends TourControls {
  readonly run: TourRun | null;
  readonly inviting: boolean;
  readonly versification: Versification;
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly cardRef: RefObject<HTMLElement | null>;
  readonly fadeRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * The tour's layer over the arcs: the invitation on a first visit, the card while the tour plays,
 * and, for reduced motion, the picture a cut crossfades from. The layer lets the pointer through
 * to the arcs; only its cards take it.
 *
 * The card sits in the corner away from the axis — top left when the axis runs along the bottom,
 * top right on an upright phone, where the axis and its names run down the left — so the
 * passages it names stay in sight.
 */
export function TourLayer({
  run,
  inviting,
  versification,
  layerRef,
  cardRef,
  fadeRef,
  ...controlsProps
}: TourLayerProps) {
  const size = useElementSize(layerRef);
  const { orientation } = computeArcLayout(size.width, size.height);
  const [regionRef, announce] = useAnnouncer<HTMLParagraphElement>();
  return (
    <div ref={layerRef} className={styles.layer} data-orientation={orientation}>
      <canvas ref={fadeRef} className={styles.fade} aria-hidden="true" />
      {inviting && <Invitation cardRef={cardRef} {...controlsProps} />}
      {run && (
        <TourCard
          cardRef={cardRef}
          plan={run.plan}
          card={run.card ?? 0}
          count={run.plan.stops.length + (run.plan.finale ? 1 : 0)}
          paused={run.paused}
          versification={versification}
          announce={announce}
          {...controlsProps}
        />
      )}
      <p ref={regionRef} className={styles.visuallyHidden} role="status" />
    </div>
  );
}

function Invitation({
  cardRef,
  onStart,
  onDismiss,
}: TourControls & { readonly cardRef: RefObject<HTMLElement | null> }) {
  const { t } = useLocalization();
  return (
    <section
      ref={cardRef}
      className={`${styles.card} ${styles.invite}`}
      aria-label={t('tour.region')}
    >
      <p className={styles.inviteText}>{t('tour.invite')}</p>
      <div className={styles.actions}>
        <button type="button" className={`${controls.button} ${styles.start}`} onClick={onStart}>
          <PlayIcon />
          {t('tour.start')}
        </button>
        <button type="button" className={`${controls.button} ${styles.quiet}`} onClick={onDismiss}>
          {t('tour.dismiss')}
        </button>
      </div>
    </section>
  );
}

interface TourCardProps extends TourControls {
  readonly cardRef: RefObject<HTMLElement | null>;
  readonly plan: TourPlan;
  readonly card: number;
  readonly count: number;
  readonly paused: boolean;
  readonly versification: Versification;
  readonly announce: (message: string) => void;
}

function TourCard({
  cardRef,
  plan,
  card,
  count,
  paused,
  versification,
  announce,
  onPause,
  onResume,
  onClose,
}: TourCardProps) {
  const { t, n } = useLocalization();
  const words = useCardWords(plan, card, versification);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Started from a button that is gone now (the invitation, or a row of a closed menu): the
  // reader's keys go on to the tour's own, and Escape ends it from anywhere.
  useEffect(() => {
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  // Each stop is said as it arrives: the card changes where a screen reader is not looking.
  const say = useEffectEvent(() => {
    announce(t('tour.announce')(n(card + 1), n(count), words.title, words.passages.join(' → ')));
  });
  useEffect(() => {
    say();
  }, [card]);

  const toggleLabel = paused ? t('tour.resume') : t('tour.pause');
  return (
    <section
      ref={cardRef}
      className={styles.card}
      aria-label={t('tour.region')}
      data-paused={paused || undefined}
    >
      <div className={styles.head}>
        <p className={styles.progress}>
          {t('tour.progress')(n(card + 1), n(count))}
          {paused && ` · ${t('tour.paused')}`}
        </p>
        <button
          ref={toggleRef}
          type="button"
          className={`${controls.button} ${styles.icon}`}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={paused ? onResume : onPause}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          type="button"
          className={`${controls.button} ${styles.icon}`}
          aria-label={t('tour.close')}
          title={t('tour.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      {/* A new stop's words come in afresh; a second shot of the same stop keeps them. */}
      <div key={card} className={styles.copy}>
        <h2 className={styles.title}>{words.title}</h2>
        <p className={styles.passages}>
          <Chain passages={words.passages} />
        </p>
        <p className={styles.line}>{words.line}</p>
      </div>
    </section>
  );
}
