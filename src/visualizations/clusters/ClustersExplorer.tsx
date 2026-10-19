import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { BOOKS, isBookId, type BookId } from '../../core/bible/books.ts';
import type { Passage } from '../../core/bible/passage.ts';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { PlayIcon, StopIcon } from '../../shared/ui/icons.tsx';
import { Credits } from '../shared/components/Credits.tsx';
import { FiltersMenu } from '../shared/components/FiltersMenu.tsx';
import { GenreMenu } from '../shared/components/GenreMenu.tsx';
import { toggleGenre } from '../shared/components/GenreToggles.tsx';
import { PassagePanel } from '../shared/components/PassagePanel.tsx';
import { ReferenceSearch } from '../shared/components/ReferenceSearch.tsx';
import { SavedMenu } from '../shared/components/SavedMenu.tsx';
import { VizPage } from '../shared/components/VizPage.tsx';
import controls from '../shared/components/controls.module.css';
import { DEFAULT_LINK_FILTER, selectLinks } from '../shared/link-filter.ts';
import type { VisualizationProps } from '../visualization.ts';
import { ClustersStage } from './ClustersStage.tsx';
import stageStyles from './ClustersStage.module.css';
import { playTour, tourPassages } from './tour.ts';

const INSPIRATION = {
  title: 'Bible Fascinator',
  author: 'Chris Woods (Drawing with Data)',
  url: 'https://designs.drawingwithdata.com/fascinator',
};

/** Marks the tour's own button, so pressing it toggles the tour rather than interrupting it. */
const TOUR_TOGGLE = 'data-tour-toggle';

/** A page opened at `?tour` starts the tour by itself, e.g. on a screen at an exhibition. */
function askedForTour(): boolean {
  return new URLSearchParams(window.location.search).has('tour');
}

export function ClustersExplorer({
  data,
  active,
  passage,
  onNavigate,
  filter,
  onFilterChange,
  masthead,
  translationMenu,
  passageLinks,
  shareUrl,
}: VisualizationProps) {
  const { t, books } = useLocalization();
  const { index } = data.crossReferences;
  const [openBook, setOpenBook] = useState<BookId | null>(null);
  // Only the view the page was opened on may take the hint: every view is mounted at once.
  const [touring, setTouring] = useState(() => active && askedForTour());
  const stops = useMemo(() => tourPassages(data.versification), [data.versification]);
  const shownLinks = useMemo(
    () => selectLinks(index, data.verseGenres, filter).length,
    [index, data.verseGenres, filter],
  );

  // Each stop is a passage like any other, so the panel shows its text and connections. The first
  // is a history entry of its own and the rest replace it: Back leaves the tour in one step.
  const visit = useEffectEvent((stop: Passage, position: number) => {
    onNavigate(stop, { replace: position > 0 });
  });

  useEffect(() => {
    if (!touring || !active) return undefined;
    // Anything the reader does ends the tour: a touch, a key, a scroll, or Back. Pressing the
    // tour's own button (or Enter or Space on it) is left to the button, which toggles it.
    const interrupt = (event: Event) => {
      const onToggle =
        event.target instanceof Element && event.target.closest(`[${TOUR_TOGGLE}]`) !== null;
      const pressesToggle =
        event instanceof KeyboardEvent ? event.key === 'Enter' || event.key === ' ' : true;
      if (onToggle && pressesToggle) return;
      setTouring(false);
    };
    const stop = playTour(stops, visit, () => {
      setTouring(false);
    });
    window.addEventListener('pointerdown', interrupt);
    window.addEventListener('keydown', interrupt);
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('popstate', interrupt);
    return () => {
      stop();
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', interrupt);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('popstate', interrupt);
    };
  }, [touring, active, stops]);

  const closePanel = () => {
    onNavigate(null);
  };

  return (
    <VizPage
      masthead={masthead}
      credits={<Credits translation={data.translation.manifest} inspiration={INSPIRATION} />}
      onPanelClose={closePanel}
      controls={
        <>
          <ReferenceSearch
            versification={data.versification}
            translation={data.translation}
            onSelect={onNavigate}
          />
          {translationMenu}
          <SavedMenu
            versification={data.versification}
            translation={data.translation}
            onSelect={onNavigate}
          />
          <select
            className={`${controls.select} ${stageStyles.bookSelect}`}
            aria-label={t('clusters.book')}
            title={t('clusters.book')}
            value={openBook ?? ''}
            onChange={(event) => {
              const { value } = event.target;
              setOpenBook(isBookId(value) ? value : null);
            }}
          >
            <option value="">{t('clusters.wholeBible')}</option>
            {BOOKS.map((book) => (
              <option key={book.id} value={book.id}>
                {books[book.id].name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={controls.button}
            {...{ [TOUR_TOGGLE]: '' }}
            aria-pressed={touring}
            aria-label={touring ? t('clusters.tour.stop') : t('clusters.tour.start')}
            title={touring ? t('clusters.tour.stop') : t('clusters.tour.start')}
            onClick={() => {
              if (!touring) setOpenBook(null);
              setTouring(!touring);
            }}
          >
            {touring ? <StopIcon /> : <PlayIcon />}
          </button>
          <GenreMenu
            hiddenGenres={filter.hiddenGenres}
            onToggle={(genre) => {
              onFilterChange({ ...filter, hiddenGenres: toggleGenre(filter.hiddenGenres, genre) });
            }}
          />
          <FiltersMenu
            filter={filter}
            defaults={DEFAULT_LINK_FILTER}
            onChange={onFilterChange}
            shownLinks={shownLinks}
            totalLinks={index.linkCount}
          />
        </>
      }
      panel={
        passage && (
          <PassagePanel
            data={data}
            passage={passage}
            filter={filter}
            actions={passageLinks(passage)}
            onSelect={onNavigate}
            onClose={closePanel}
            shareUrl={shareUrl}
          />
        )
      }
    >
      <ClustersStage
        data={data}
        active={active}
        filter={filter}
        openBook={openBook}
        focus={passage}
        onSelect={onNavigate}
        onOpenBook={setOpenBook}
      />
    </VizPage>
  );
}
