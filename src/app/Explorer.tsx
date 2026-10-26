import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { formatPassage, type Passage } from '../core/bible/passage.ts';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary.tsx';
import { getTranslationManifest } from '../translations/registry.ts';
import controls from '../visualizations/shared/components/controls.module.css';
import { DEFAULT_LINK_FILTER, type LinkFilter } from '../visualizations/shared/link-filter.ts';
import { Credits } from '../visualizations/shared/components/Credits.tsx';
import { TextPending } from '../visualizations/shared/components/TextPending.tsx';
import { TranslationMenu } from '../visualizations/shared/components/TranslationMenu.tsx';
import { VizPage } from '../visualizations/shared/components/VizPage.tsx';
import { useCompleteData, useTextStatus } from '../visualizations/shared/use-text-status.ts';
import {
  resetTranslation,
  translationLoader,
  type EarlyVizData,
  type VizCore,
} from '../visualizations/shared/viz-data.ts';
import styles from './Explorer.module.css';
import { explorerUrl, plainLocaleFor, plainTranslationFor } from './explorer-location.ts';
import { InAppLink } from './InAppLink.tsx';
import { readPreferredTranslation, useTranslationPreference } from './translation-choice.ts';
import { useExplorerLocation } from './use-explorer-location.ts';
import { ViewSwitch } from './ViewSwitch.tsx';
import type { LocaleId } from '../i18n/locale-id.ts';
import { translationDatasetPath } from '../core/datasets/paths.ts';
import { cacheDatasets } from './register-offline-cache.ts';
import { setActiveLocale, useLocalePreference, usePreferredLocale } from '../i18n/locale-choice.ts';
import { getLocale } from '../i18n/registry.ts';
import { useLocalization } from '../i18n/use-locale.tsx';
import { VIEWS, type View } from './views.ts';

const [HOME] = VIEWS;

/**
 * The app: every visualization over one shared passage, with a switch between them.
 *
 * All of them stay mounted and only the active one is shown, so switching is instant and each
 * keeps its own state (the arcs' zoom, the reading position, the filters). The site's name links
 * home and starts over: it remounts every view in its default state.
 */
export function Explorer({ core }: { readonly core: VizCore }) {
  const { t, books } = useLocalization();
  const [, rememberLocale] = useLocalePreference();
  // The fallback for an address that names no language — the reader's own, not the one the
  // last address happened to set.
  const preferredLocale = usePreferredLocale();
  const { versification } = core;
  // The reader's own translation, from an earlier visit; the URL still wins over it. Read at the
  // reader's own language, because this answers "what may a link leave out", not "what does this
  // link show".
  const [preferredTranslation, rememberTranslation] = useTranslationPreference(preferredLocale);
  // The URL holds the view, the passage, the filter and the translation: one filter for every
  // view, so they agree on which links exist, and a shared link shows exactly what its author saw.
  //
  // The translation default is passed as a function so the address can settle the language first
  // and ask for that language's Bible — `readPreferredTranslation` returns an explicit choice
  // where there is one, and the language's own text otherwise. Handing it a value computed from a
  // store instead let a `?lang=pt` entry reached by pressing Back show the English Bible.
  const [location, navigate] = useExplorerLocation(
    VIEWS,
    versification,
    readPreferredTranslation,
    preferredLocale,
  );
  // The address is what the app speaks, not the other way round. It already answers both cases —
  // a URL naming a language, and one that does not, which falls back to the reader's own — and
  // taking the language from it is what makes Back work: a history entry carries the language it
  // was created with, so returning to it returns to that language.
  const localeId = location.locale;
  const { passage, filter } = location;
  // Nothing waits for the text as a whole. The views drawn from the links show at once, and only
  // what shows words waits for them, in place — on a phone the text lands seconds after the
  // links. Switching happens in a transition, so the previous text stays on screen while the
  // next one downloads instead of the words emptying.
  const text = useTextStatus(location.translation);
  const translationManifest = getTranslationManifest(location.translation);
  const early = useMemo<EarlyVizData>(
    () => ({ ...core, translationManifest, text }),
    [core, translationManifest, text],
  );
  const complete = useCompleteData(early);
  const [isSwitchingTranslation, switchTranslation] = useTransition();
  // Where the reader is by the time a text arrives, which is not where they were when they asked
  // for it: a download takes a second or two, and they can read on meanwhile.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  // The last text asked for, so that a slow first choice cannot overrule a quick second one.
  const requestedTranslation = useRef(location.translation);
  const [translationError, setTranslationError] = useState<string | null>(null);
  // The picker shows the chosen translation the moment it is picked; the text on screen catches
  // up when its file arrives, which on a slow connection is a second or two later.
  const [chosenTranslation, chooseTranslation] = useOptimistic(location.translation);
  // Bumped by the home link: part of every view's key, so each one remounts from scratch.
  const [generation, setGeneration] = useState(0);
  // After the switch or the home link, keyboard focus follows into the newly shown view: this is
  // the element to focus there.
  const focusTarget = useRef<string | null>(null);
  const active = VIEWS.find((view) => view.id === location.view) ?? HOME;

  const title = [
    passage && formatPassage(passage, versification, books),
    active === HOME ? null : t(active.titleKey),
    t('app.name'),
  ]
    .filter((part) => part !== null)
    .join(' · ');
  useEffect(() => {
    document.title = title;
  }, [title]);

  // The language a reader picks belongs in the address, so a reload or a bookmark keeps it, and
  // so does `<html lang>`, which is what a screen reader and the browser's own translation
  // prompt read.
  // Before paint, not after. Everything outside this component reads the language from its own
  // store, so the address's answer has to be there by the time anything renders — an effect that
  // runs afterwards leaves one painted frame where `<html lang>` and every link say Portuguese
  // and the words are still English, which is exactly the frame Back lands on.
  //
  // Rewriting the address to match the store instead would erase the language from whichever
  // history entry the reader just returned to.
  useLayoutEffect(() => {
    document.documentElement.lang = getLocale(localeId).tag;
    setActiveLocale(localeId);
  }, [localeId]);

  // Choosing a language records it for next time and puts it in the address, so the choice
  // survives a reload and travels with a shared link.
  const chooseLocale = useCallback(
    (id: LocaleId) => {
      rememberLocale(id);
      // The Bible follows the language for a reader who has not chosen one of their own, and
      // stays put for a reader who has — `readPreferredTranslation` answers both. Naming it in
      // the address keeps the two from drifting apart on the way back through history.
      const translation = readPreferredTranslation(id);
      navigate({ ...locationRef.current, locale: id, translation });
      // And it is downloaded now, while there is certainly a network, rather than the next time
      // the reader opens the app — which may be from a home-screen icon on a plane.
      cacheDatasets([translationDatasetPath(translation)]);
    },
    [rememberLocale, navigate],
  );

  useEffect(() => {
    const selector = focusTarget.current;
    if (selector !== null) {
      focusTarget.current = null;
      document.querySelector<HTMLElement>(`[data-view="${location.view}"] ${selector}`)?.focus();
    }
  }, [location.view, generation]);

  const plainTranslation = plainTranslationFor(preferredTranslation);
  const plainLocale = plainLocaleFor(preferredLocale);
  const hrefOf = (view: View, target: Passage | null) =>
    explorerUrl(
      view,
      { passage: target, filter, translation: location.translation, locale: localeId },
      import.meta.env.BASE_URL,
      versification,
      plainTranslation,
      plainLocale,
    );

  // Beside the search box: what a reader is looking at, not how it is drawn, so it sits with the
  // passage rather than with the filters.
  const translationMenu = (
    <TranslationMenu
      current={getTranslationManifest(chosenTranslation)}
      pending={isSwitchingTranslation}
      error={translationError}
      localeId={localeId}
      onLocaleChange={chooseLocale}
      onChange={(id) => {
        setTranslationError(null);
        requestedTranslation.current = id;
        switchTranslation(async () => {
          // The picker moves at once; the text takes a moment, and the previous one stays on
          // screen meanwhile. Fetching here rather than while rendering keeps a failed download
          // (offline, say) from replacing the page with an error: the reader keeps what they had.
          chooseTranslation(id);
          try {
            await translationLoader(id).load();
          } catch {
            resetTranslation(id);
            setTranslationError(t('menu.translation.failed')(getTranslationManifest(id).name));
            return;
          }
          if (requestedTranslation.current !== id) {
            return; // They have since asked for another one; that request owns the screen.
          }
          // Remembered only now: a text that never arrived must not greet them next time.
          rememberTranslation(id);
          // Like a filter change: Back returns to the previous passage, not the previous text.
          navigate({ ...locationRef.current, translation: id }, { replace: true });
        });
      }}
    />
  );

  const masthead = (
    <>
      <h1 className={styles.title}>
        <InAppLink
          href={hrefOf(HOME, null)}
          className={styles.home}
          onFollow={() => {
            focusTarget.current = 'h1 a';
            navigate({
              view: HOME.id,
              passage: null,
              filter: DEFAULT_LINK_FILTER,
              translation: location.translation,
              locale: localeId,
            });
            setGeneration((value) => value + 1);
          }}
        >
          <span className={styles.fullName}>{t('app.name')}</span>
          <span className={styles.shortName}>{t('app.name.short')}</span>
        </InAppLink>
      </h1>
      <ViewSwitch
        views={VIEWS}
        current={location.view}
        hrefOf={(view) => hrefOf(view, passage)}
        onOpen={(view) => {
          focusTarget.current = '[aria-current="page"]';
          navigate({ ...location, view: view.id, passage });
        }}
      />
    </>
  );

  const credits = <Credits translation={translationManifest} />;
  // A view made of words waits for them inside its own frame: the masthead stays, so the views
  // already drawn are one switch away, and so does the translation picker.
  const waitingFrame = (
    <VizPage masthead={masthead} credits={credits} tools={translationMenu}>
      {text.state !== 'loaded' && (
        <TextPending
          status={text}
          onRetry={() => {
            resetTranslation(location.translation);
          }}
        />
      )}
    </VizPage>
  );

  return VIEWS.map((view) => {
    const isActive = view === active;
    const props = {
      active: isActive,
      passage,
      onNavigate: (target: Passage | null, options?: { readonly replace?: boolean }) => {
        navigate({ ...location, view: view.id, passage: target }, options);
      },
      filter,
      onFilterChange: (next: LinkFilter) => {
        // A filter tweak replaces the history entry: Back returns to the previous passage.
        navigate({ ...location, filter: next }, { replace: true });
      },
      masthead,
      translationMenu,
      shareUrl: (target: Passage) =>
        new URL(
          explorerUrl(
            HOME,
            {
              passage: target,
              filter: DEFAULT_LINK_FILTER,
              translation: location.translation,
              locale: localeId,
            },
            '',
            versification,
            // A quote carries the name of the text it is in, so its link always names it too:
            // whoever opens it reads the words that were quoted, not their own translation of
            // them.
            null,
          ),
          import.meta.env.SITE_URL,
        ).href,
      passageLinks: (target: Passage) =>
        VIEWS.filter((other) => other !== view).map((other) => (
          <InAppLink
            key={other.id}
            href={hrefOf(other, target)}
            className={controls.button}
            onFollow={() => {
              navigate({ ...location, view: other.id, passage: target });
            }}
          >
            <other.icon />
            {t(other.openLabelKey)}
          </InAppLink>
        )),
    };
    return (
      <div
        key={`${view.id}:${String(generation)}`}
        className={styles.view}
        data-view={view.id}
        data-active={isActive}
        inert={!isActive}
      >
        {/* One view failing (e.g. without WebGL) keeps the page frame, so the other stays one
            switch away. */}
        <ErrorBoundary
          fallback={(error) => (
            <VizPage masthead={masthead} credits={credits}>
              <p role="alert" className={styles.error}>
                {t('error.viewFailed')(t(view.titleKey), error.message)}
              </p>
            </VizPage>
          )}
        >
          {'drawsBeforeText' in view ? (
            <view.Component data={early} {...props} />
          ) : (
            // A boundary of its own: such a view is first drawn when the words arrive, and the
            // moment its code takes to start must not blank the views already on screen.
            <Suspense fallback={waitingFrame}>
              {complete === null ? waitingFrame : <view.Component data={complete} {...props} />}
            </Suspense>
          )}
        </ErrorBoundary>
      </div>
    );
  });
}
