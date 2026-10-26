import { translationDatasetPath } from '../core/datasets/paths.ts';
import { mount } from '../shared/lib/mount.tsx';
import { VizDataBoundary } from '../visualizations/shared/components/VizDataBoundary.tsx';
import {
  afterLinksDownloaded,
  translationLoader,
  vizCoreLoader,
} from '../visualizations/shared/viz-data.ts';
import { Explorer } from './Explorer.tsx';
import { registerOfflineCache } from './register-offline-cache.ts';
import {
  initialPreferredLocale,
  setActiveLocale,
  setPreferredLocale,
} from '../i18n/locale-choice.ts';
import { getLocale } from '../i18n/registry.ts';
import { initialChoice } from './initial-choice.ts';
import { LOCALE_PREFERENCE, TRANSLATION_PREFERENCE } from '../shared/lib/preference-keys.ts';
import { readPreference } from '../shared/lib/preferences.ts';

// Which language to speak is settled before anything renders, so the first paint is already in
// it: the address decides, then the reader's last choice, then what their browser asks for. It
// is stored at once so that every component — the app, and the install dialog beside it — reads
// the same answer from the same place.
const url = new URL(window.location.href);
// One rule, shared with the build: the same function decides which dataset the HTML preloads
// before any of this has parsed. See `initialChoice`.
const { locale, translation } = initialChoice(
  url.searchParams,
  {
    locale: readPreference(LOCALE_PREFERENCE),
    translation: readPreference(TRANSLATION_PREFERENCE),
  },
  navigator.languages,
);
setActiveLocale(locale);
// Kept apart from the one above: this is the reader's own language, which an address naming
// someone else's does not change, and which a URL naming none falls back to.
setPreferredLocale(initialPreferredLocale(navigator.languages));
document.documentElement.lang = getLocale(locale).tag;

// The text downloads once the links' bytes are in, not beside them: the first picture is drawn
// from the links alone, and on a slow connection the two would split the bandwidth and hold it
// back by seconds. It starts before the links are read, so the connection is not idle meanwhile.
// Nothing waits for it here — the views follow its status (see `useTextStatus`), so a failure is
// handled there.
const loadingTranslation = new Promise<unknown>((resolve) => {
  afterLinksDownloaded(() => {
    resolve(translationLoader(translation).load());
  });
});
void loadingTranslation.catch(() => undefined);

mount(<VizDataBoundary>{(core) => <Explorer core={core} />}</VizDataBoundary>);

// Once the data has loaded, the offline cache can keep it: from the HTTP cache, not the network.
// The text is named explicitly, since the worker only knows the default one — and if that one
// download is the thing that failed, the rest is still worth keeping.
Promise.allSettled([vizCoreLoader.load(), loadingTranslation]).then(
  ([core, text]) => {
    if (core.status === 'rejected') {
      return;
    }
    registerOfflineCache(text.status === 'fulfilled' ? [translationDatasetPath(translation)] : []);
  },
  () => undefined,
);
