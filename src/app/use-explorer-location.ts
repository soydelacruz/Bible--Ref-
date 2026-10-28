import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { Versification } from '../core/bible/versification.ts';
import type { TranslationId } from '../core/datasets/ids.ts';
import type { LocaleId } from '../i18n/locale-id.ts';
import {
  explorerUrl,
  parseExplorerUrl,
  plainLocaleFor,
  plainTranslationFor,
  type ExplorerLocation,
  type ViewRoute,
} from './explorer-location.ts';

/** How a location change enters the browser history. */
export interface NavigateOptions {
  /** Replace the current entry instead of adding one (e.g. for filter changes). */
  readonly replace?: boolean;
}

/**
 * How a step through the history (Back, Forward) reaches the screen: handed the location shown,
 * the one it returns to and the way to show that, so the host can show it as it shows a change of
 * its own.
 */
export type ShowHistoryStep<Id extends string> = (
  previous: ExplorerLocation<Id>,
  next: ExplorerLocation<Id>,
  show: () => void,
  event: PopStateEvent,
) => void;

/**
 * The active view, the focused passage and the link filter, kept in the URL. A new passage or view
 * is a browser history entry, so the back button (or gesture) returns to the previous one; it is
 * shown at once, unless `showHistoryStep` shows it otherwise.
 */
export function useExplorerLocation<Id extends string>(
  routes: readonly [ViewRoute<Id>, ...ViewRoute<Id>[]],
  versification: Versification,
  defaultTranslation: (locale: LocaleId) => TranslationId,
  defaultLocale: LocaleId,
  showHistoryStep?: ShowHistoryStep<Id>,
): readonly [
  ExplorerLocation<Id>,
  (next: ExplorerLocation<Id>, options?: NavigateOptions) => void,
] {
  const read = useCallback(
    () =>
      parseExplorerUrl(
        new URL(window.location.href),
        import.meta.env.BASE_URL,
        routes,
        versification,
        defaultTranslation,
        defaultLocale,
      ),
    [routes, versification, defaultTranslation, defaultLocale],
  );
  const [location, setLocation] = useState(read);
  const stepThroughHistory = useEffectEvent((event: PopStateEvent) => {
    const next = read();
    const show = () => {
      setLocation(next);
    };
    if (showHistoryStep) {
      showHistoryStep(location, next, show, event);
    } else {
      show();
    }
  });

  useEffect(() => {
    const syncFromUrl = (event: PopStateEvent) => {
      stepThroughHistory(event);
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, [read]);

  const navigate = useCallback(
    (next: ExplorerLocation<Id>, { replace = false }: NavigateOptions = {}) => {
      setLocation(next);
      const route = routes.find((candidate) => candidate.id === next.view) ?? routes[0];
      const url = explorerUrl(
        route,
        next,
        import.meta.env.BASE_URL,
        versification,
        // What this reader would land on without a `?t=`: their own preference, read at their
        // own language rather than at whatever language the address happens to name.
        plainTranslationFor(defaultTranslation(defaultLocale)),
        plainLocaleFor(defaultLocale),
      );
      if (url !== `${window.location.pathname}${window.location.search}`) {
        if (replace) {
          window.history.replaceState(null, '', url);
        } else {
          window.history.pushState(null, '', url);
        }
      }
    },
    [routes, versification, defaultTranslation, defaultLocale],
  );

  return [location, navigate];
}
