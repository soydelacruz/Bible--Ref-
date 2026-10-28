import { useEffect, useLayoutEffect, useState } from 'react';
import type { Passage } from '../core/bible/passage.ts';
import { ARCS_TOUR_PREFERENCE, START_HERE_PREFERENCE } from '../shared/lib/preference-keys.ts';
import {
  hasStoredPreferences,
  useBooleanPreference,
  useStringPreference,
} from '../shared/lib/preferences.ts';
import {
  DEFAULT_LINK_FILTER,
  isDefaultFilter,
  type LinkFilter,
} from '../visualizations/shared/link-filter.ts';

/** The strip has welcomed this reader, and stays until they close it or go in. */
const OPEN = 'open';
/** They have: it never shows again. */
const CLOSED = 'closed';

/** Where the reader is, as far as the strip is concerned. */
interface Whereabouts {
  readonly view: string;
  readonly passage: Passage | null;
  readonly filter: LinkFilter;
}

/**
 * The front page as a first-time reader finds it: the home view, nothing open, the default links.
 * The language and the translation do not count, so a link that names only those still lands here.
 */
export function isFrontPage({ view, passage, filter }: Whereabouts, home: string): boolean {
  return view === home && passage === null && isDefaultFilter(filter, DEFAULT_LINK_FILTER);
}

export interface StartHere {
  /** The strip is on screen. */
  readonly shown: boolean;
  /** Puts it away for good. */
  readonly close: () => void;
}

/**
 * The first visit's Start here strip: what the picture is, and three ways in.
 *
 * It welcomes a reader who arrives at the front page with nothing stored — no language or
 * translation chosen, no verse saved, nothing folded — rather than by a link to somewhere in
 * particular. It stays, across reloads, until they close it or go anywhere from the front page:
 * by one of its own ways in, or by one of theirs (a passage, another view, another filter). Then
 * it is gone for good.
 *
 * It offers the tour, so while it shows, the tour's own invitation stands down — for good too:
 * a reader is asked about the tour once, by whichever comes first.
 */
export function useStartHere(atFrontPage: boolean): StartHere {
  const [stored, store] = useStringPreference(START_HERE_PREFERENCE, '');
  const [, offerTour] = useBooleanPreference(ARCS_TOUR_PREFERENCE, false);
  // Settled as the visit begins, before the visit itself has stored anything.
  const [welcomed] = useState(
    () => stored === OPEN || (stored === '' && atFrontPage && !hasStoredPreferences()),
  );
  const open = welcomed && stored !== CLOSED;

  // Before paint, so the tour's invitation, which this replaces, never shows beside it.
  useLayoutEffect(() => {
    if (open && stored !== OPEN) {
      store(OPEN);
      offerTour(true);
    }
  }, [open, stored, store, offerTour]);

  // Gone in: whichever way they went, the welcome is over.
  useEffect(() => {
    if (open && !atFrontPage) {
      store(CLOSED);
    }
  }, [open, atFrontPage, store]);

  return {
    shown: open && atFrontPage,
    close: () => {
      store(CLOSED);
    },
  };
}
