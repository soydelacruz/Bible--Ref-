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
import { formatPassage, isSamePassage, versePassage, type Passage } from '../core/bible/passage.ts';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary.tsx';
import { getTranslationManifest } from '../translations/registry.ts';
import controls from '../visualizations/shared/components/controls.module.css';
import { DEFAULT_LINK_FILTER, type LinkFilter } from '../visualizations/shared/link-filter.ts';
import { Credits } from '../visualizations/shared/components/Credits.tsx';
import { LoadingArcs } from '../visualizations/shared/components/LoadingArcs.tsx';
import { TextPending } from '../visualizations/shared/components/TextPending.tsx';
import { TranslationMenu } from '../visualizations/shared/components/TranslationMenu.tsx';
import { HeaderActions, VizPage } from '../visualizations/shared/components/VizPage.tsx';
import { useAnnouncer } from '../visualizations/shared/use-announcer.ts';
import { useCompleteData, useTextStatus } from '../visualizations/shared/use-text-status.ts';
import {
  resetTranslation,
  translationLoader,
  type EarlyVizData,
  type VizCore,
} from '../visualizations/shared/viz-data.ts';
import styles from './Explorer.module.css';
import {
  explorerUrl,
  plainLocaleFor,
  plainTranslationFor,
  type ExplorerLocation,
} from './explorer-location.ts';
import { InAppLink } from './InAppLink.tsx';
import { readPreferredTranslation, useTranslationPreference } from './translation-choice.ts';
import { useExplorerLocation, type ShowHistoryStep } from './use-explorer-location.ts';
import { useViewOpening } from './use-view-opening.ts';
import { useViewSwitch } from './use-view-switch.ts';
import { useWander } from './use-wander.ts';
import { ViewSwitch } from './ViewSwitch.tsx';
import { WanderButton } from './WanderButton.tsx';
import type { LocaleId } from '../i18n/locale-id.ts';
import { translationDatasetPath } from '../core/datasets/paths.ts';
import { cacheDatasets } from './register-offline-cache.ts';
import { setActiveLocale, useLocalePreference, usePreferredLocale } from '../i18n/locale-choice.ts';
import { getLocale } from '../i18n/registry.ts';
import { useLocalization } from '../i18n/use-locale.tsx';
import { VIEWS, type View, type ViewId } from './views.ts';

const [HOME] = VIEWS;

/** What holds a view: the switch looks for the focused passage in it. */
function viewElement(id: ViewId): Element | null {
  return document.querySelector(`[data-view="${id}"]`);
}

/** Starts downloading a view's code. */
function loadView(id: ViewId): Promise<unknown> {
  return (VIEWS.find((view) => view.id === id) ?? HOME).load();
}

/** Tells the host when what a view shows first is on the page, and when it goes. */
function Mounted({
  view,
  onMounted,
}: {
  readonly view: ViewId;
  readonly onMounted: (view: ViewId, isMounted: boolean) => void;
}) {
  useEffect(() => {
    onMounted(view, true);
    return () => {
      onMounted(view, false);
    };
  }, [view, onMounted]);
  return null;
}

/**
 * The app: every visualization over one shared passage, with a switch between them.
 *
 * A view is mounted the first time it is opened, and then stays mounted with only the active one
 * shown, so switching back is instant and each keeps its own state (the arcs' zoom, the reading
 * position, the filters) — while a reader who never opens a view downloads and draws none of it.
 * The site's name links home and starts over: it remounts every open view in its default state.
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
  const switchView = useViewSwitch();
  const opening = useViewOpening(loadView);
  /**
   * Shows `next`, in another view than `previous`, so that the reader sees the views change and,
   * when the focused passage goes along, where it went (see `runViewSwitch`). Within one view it
   * shows at once: each view moves to a passage its own way (the arcs fly, the threads scroll).
   */
  const switchViews = (
    previous: ExplorerLocation<ViewId>,
    next: ExplorerLocation<ViewId>,
    update: () => void,
  ) => {
    if (previous.view === next.view) {
      update();
      return;
    }
    const kept = isSamePassage(previous.passage, next.passage) ? previous.passage : null;
    switchView({
      update,
      from: viewElement(previous.view),
      to: viewElement(next.view),
      carried: kept && { passage: kept, label: formatPassage(kept, versification, books) },
    });
  };
  // Back and Forward cross between views as the switch does — unless the browser has shown the
  // step its own way (a swipe back, on a phone), which a second animation would only repeat.
  const showHistoryStep: ShowHistoryStep<ViewId> = (previous, next, show, event) => {
    if (event.hasUAVisualTransition || previous.view === next.view) {
      opening.cancel();
      show();
      return;
    }
    // Into another view, which is opened first if it has not been yet (see `goTo`). The address
    // has already moved, so a step still waiting when it moves again — a link followed, a
    // passage opened — is out of date, and the newer one owns the screen.
    const address = window.location.href;
    opening.whenOpen(next.view, () => {
      if (window.location.href === address) {
        switchViews(previous, next, show);
      }
    });
  };
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
    showHistoryStep,
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
  // for it: a download takes a second or two, and they can read on meanwhile. Likewise by the
  // time a view opened for the first time is ready to be shown.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  /**
   * Shows the location `toward` makes of the one on screen: in another view, with a switch
   * between the two (see `switchViews`).
   *
   * A view not opened yet is mounted out of sight first, and shown once it is ready, as though it
   * had been there all along (see `useViewOpening`). That takes a moment, which the passage on
   * screen may not wait out — a tour moves on, a text arrives — so `toward` is asked only then,
   * of the location on screen by that time. Whatever the reader asks for meanwhile, in this view
   * or another, takes its place: the last request is the one shown.
   */
  const goTo = (
    toward: (current: ExplorerLocation<ViewId>) => ExplorerLocation<ViewId>,
    show: (next: ExplorerLocation<ViewId>) => void,
  ) => {
    const view = toward(location).view;
    if (view === location.view) {
      opening.cancel();
      show(toward(location));
      return;
    }
    opening.whenOpen(view, () => {
      const previous = locationRef.current;
      const next = toward(previous);
      switchViews(previous, next, () => {
        show(next);
      });
    });
  };
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
  // Focus goes there once it exists: a view opened for the first time can be shown before its
  // code has arrived (the loading arcs stand in for it), and is focused into when it is drawn.
  const focusInto = useCallback((view: ViewId) => {
    const selector = focusTarget.current;
    const target =
      selector === null
        ? null
        : document.querySelector<HTMLElement>(`[data-view="${view}"] ${selector}`);
    if (target) {
      focusTarget.current = null;
      target.focus();
    }
  }, []);
  const { onMounted: onViewOpened } = opening;
  const onViewMounted = useCallback(
    (view: ViewId, isMounted: boolean) => {
      onViewOpened(view, isMounted);
      if (isMounted && view === locationRef.current.view) {
        focusInto(view);
      }
    },
    [onViewOpened, focusInto],
  );
  const active = VIEWS.find((view) => view.id === location.view) ?? HOME;
  const wander = useWander(core, filter, passage);
  // The compass turns on the first press only.
  const [hasWandered, setHasWandered] = useState(false);
  // Says where Wander went. The views' panels describe a passage once it is open, but not every
  // view has its panel up at once (Clusters waits for the words), and this region outlives them.
  const [wanderStatus, announceWander] = useAnnouncer<HTMLParagraphElement>();

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
    focusInto(location.view);
  }, [location.view, generation, focusInto]);

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
            goTo(
              (current) => ({
                view: HOME.id,
                passage: null,
                filter: DEFAULT_LINK_FILTER,
                translation: current.translation,
                locale: current.locale,
              }),
              (next) => {
                focusTarget.current = 'h1 a';
                navigate(next);
                setGeneration((value) => value + 1);
              },
            );
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
          goTo(
            (current) => ({ ...current, view: view.id }),
            (next) => {
              focusTarget.current = '[aria-current="page"]';
              navigate(next);
            },
          );
        }}
      />
    </>
  );

  // In every view's header. The way there is the view's own, as for any passage it is handed: the
  // arcs fly, the threads open the chapter at the verse, the clusters focus it.
  const wanderButton = (
    <WanderButton
      flourish={!hasWandered}
      onWander={() => {
        const verse = wander();
        if (verse === null) {
          announceWander(t('wander.none'));
          return;
        }
        const target = versePassage(verse);
        // A history entry of its own, like any passage opened: Back returns to where they were.
        navigate({ ...location, passage: target });
        announceWander(t('wander.arrived')(formatPassage(target, versification, books)));
        setHasWandered(true);
      }}
    />
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

  // Only the views opened so far are mounted: one the reader never opens is never downloaded or
  // drawn.
  const mounted = VIEWS.filter((view) => view === active || opening.opened.has(view.id));
  const views = mounted.map((view) => {
    const isActive = view === active;
    const props = {
      active: isActive,
      passage,
      onNavigate: (target: Passage | null, options?: { readonly replace?: boolean }) => {
        goTo(
          (current) => ({ ...current, view: view.id, passage: target }),
          (next) => {
            navigate(next, options);
          },
        );
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
              goTo(
                (current) => ({ ...current, view: other.id, passage: target }),
                (next) => {
                  navigate(next);
                },
              );
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
            <>
              <VizPage masthead={masthead} credits={credits}>
                <p role="alert" className={styles.error}>
                  {t('error.viewFailed')(t(view.titleKey), error.message)}
                </p>
              </VizPage>
              <Mounted view={view.id} onMounted={onViewMounted} />
            </>
          )}
        >
          {/* A boundary of its own: a view's code is downloaded the first time it is opened, and
              the moment that takes blanks no other view. Out of sight it goes unseen; in sight,
              the loading arcs stand in for the view. */}
          <Suspense fallback={<LoadingArcs label={t('loading.view')(t(view.titleKey))} />}>
            {'drawsBeforeText' in view ? (
              <view.Component data={early} {...props} />
            ) : complete === null ? (
              // A view made of words is first drawn when they arrive.
              waitingFrame
            ) : (
              <view.Component data={complete} {...props} />
            )}
            <Mounted view={view.id} onMounted={onViewMounted} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  });

  return (
    <HeaderActions value={wanderButton}>
      {views}
      <p ref={wanderStatus} className={styles.visuallyHidden} role="status" />
    </HeaderActions>
  );
}
