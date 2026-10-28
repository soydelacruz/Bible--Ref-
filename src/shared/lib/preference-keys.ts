/**
 * The names the app stores its preferences under.
 *
 * Kept free of anything that needs a `window`, because the build imports them too: the inline
 * preload script in `vite/site-head.ts` reads the stored language and translation before any
 * module has parsed, and a key typed out by hand there would drift the first time one is renamed.
 */
const PREFIX = 'bible-cross-references:';

/** The full storage key for a preference, for code that cannot call `readPreference`. */
export function preferenceKey(name: string): string {
  return PREFIX + name;
}

export const LOCALE_PREFERENCE = 'locale';
export const TRANSLATION_PREFERENCE = 'translation';
/**
 * Whether the arcs' tour has been offered: a first visit invites the reader to it once, by the
 * tour's own invitation or by the Start here strip, whichever shows.
 */
export const ARCS_TOUR_PREFERENCE = 'arcs-tour-offered';
/**
 * The first visit's Start here strip: `open` once it has welcomed a first-time reader, `closed`
 * once they have closed it or gone in from the front page, after which it never shows again.
 */
export const START_HERE_PREFERENCE = 'start-here';

export const LOCALE_STORAGE_KEY = preferenceKey(LOCALE_PREFERENCE);
export const TRANSLATION_STORAGE_KEY = preferenceKey(TRANSLATION_PREFERENCE);
