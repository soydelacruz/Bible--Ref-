import { Fragment, type ReactNode } from 'react';
import type { Emphasized } from '../../../i18n/messages/types.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import type { LinkSummary } from '../link-summary.ts';
import styles from './LinkStats.module.css';

interface LinkStatsProps {
  readonly summary: LinkSummary;
  /**
   * How to interact, shown under the numbers: with a mouse (on wide screens), or on a touch
   * screen (phones included, since touch gestures are harder to guess).
   */
  readonly hint?: { readonly pointer: ReactNode; readonly touch: ReactNode };
  /**
   * Whether the default filter is on. It hides more than half the links while the Filters menu
   * shows nothing changed, so the line says that these are the best rated.
   */
  readonly isFilterDefault?: boolean;
  /** Opens the Filters menu, from a link after the count while the default filter is on. */
  readonly onShowFilters?: (() => void) | undefined;
}

/** Renders a message's pieces, setting its numbers apart from the words around them. */
function Line({ parts }: { readonly parts: Emphasized }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {typeof part === 'string' ? part : <strong>{part.strong}</strong>}
        </Fragment>
      ))}
    </>
  );
}

/** A quiet corner summary of what is on screen; context, not the main event. */
export function LinkStats({
  summary,
  hint,
  isFilterDefault = false,
  onShowFilters,
}: LinkStatsProps) {
  const { t, n, share } = useLocalization();
  const { verseCount, shownLinks, totalLinks, connectedVerses, crossTestamentLinks } = summary;
  const links = isFilterDefault
    ? t('stats.links.bestRated')(n(shownLinks), n(totalLinks))
    : t('stats.links')(n(shownLinks), shownLinks < totalLinks ? n(totalLinks) : null);
  return (
    <div className={styles.stats} aria-label={t('stats.label')}>
      <span>
        <Line parts={t('stats.verses')(n(verseCount))} /> · <Line parts={links} />
        {isFilterDefault && onShowFilters !== undefined && (
          // A shortcut for the pointer to the header's Filters button, which keyboards and
          // screen readers already reach; to them it would be a second button of the same name.
          <span aria-hidden="true">
            {' · '}
            <button
              type="button"
              tabIndex={-1}
              className={styles.filtersLink}
              onClick={onShowFilters}
            >
              {t('menu.filters')}
            </button>
          </span>
        )}
      </span>
      <span className={styles.secondary}>
        <Line parts={t('stats.connected')(share(connectedVerses, verseCount))} /> ·{' '}
        <Line parts={t('stats.crossTestament')(n(crossTestamentLinks))} />
      </span>
      {hint !== undefined && (
        <>
          <span className={`${styles.hint} ${styles.pointerHint}`}>{hint.pointer}</span>
          <span className={`${styles.hint} ${styles.touchHint}`}>{hint.touch}</span>
        </>
      )}
    </div>
  );
}
