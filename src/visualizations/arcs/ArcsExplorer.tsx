import { useMemo, useRef, useState } from 'react';
import {
  ClickIcon,
  DragIcon,
  HoldAndSlideIcon,
  PinchIcon,
  SaveImageIcon,
  ScrollIcon,
  TapIcon,
} from '../../shared/ui/icons.tsx';
import { Credits } from '../shared/components/Credits.tsx';
import { FiltersMenu } from '../shared/components/FiltersMenu.tsx';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { GenreLegend } from '../shared/components/GenreLegend.tsx';
import { toggleGenre } from '../shared/components/GenreToggles.tsx';
import { LinkStats } from '../shared/components/LinkStats.tsx';
import { PassagePanel } from '../shared/components/PassagePanel.tsx';
import { SavedMenu } from '../shared/components/SavedMenu.tsx';
import { ReferenceSearch } from '../shared/components/ReferenceSearch.tsx';
import { WithText } from '../shared/components/TextPending.tsx';
import { VizPage } from '../shared/components/VizPage.tsx';
import { DEFAULT_LINK_FILTER, isDefaultFilter, selectLinks } from '../shared/link-filter.ts';
import { summarizeLinks } from '../shared/link-summary.ts';
import { formatPassage, type Passage } from '../../core/bible/passage.ts';
import controls from '../shared/components/controls.module.css';
import { MAX_PIXEL_RATIO } from '../shared/frames.ts';
import { composeImage, downloadImage, imageFileName } from '../shared/image-export.ts';
import type { Connection } from '../shared/connections.ts';
import type { EarlyVizData } from '../shared/viz-data.ts';
import type { VisualizationProps } from '../visualization.ts';
import type { ArcsController } from './arcs-controller.ts';
import { ArcsStage } from './ArcsStage.tsx';

const INSPIRATION = {
  title: 'Bible Cross-References',
  author: 'Chris Harrison and Christoph Römhild',
  url: 'https://www.chrisharrison.net/index.php/visualizations/BibleViz',
};

export function ArcsExplorer({
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
}: VisualizationProps<EarlyVizData>) {
  const { t, books } = useLocalization();
  const { index } = data.crossReferences;
  const linkIds = useMemo(
    () => selectLinks(index, data.verseGenres, filter),
    [index, data.verseGenres, filter],
  );
  const summary = useMemo(
    () => summarizeLinks(index, linkIds, data.verseGenres),
    [index, linkIds, data.verseGenres],
  );
  // The summary line can open the Filters menu too, so the menu's state lives here.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closePanel = () => {
    onNavigate(null);
  };
  // A connection pointed at in the panel; it belongs to the passage it was pointed at on.
  const [preview, setPreview] = useState<{
    readonly passage: Passage;
    readonly connection: Connection;
  } | null>(null);
  const previewed = preview?.passage === passage ? preview.connection : null;
  const snapshotRef = useRef<ArcsController['snapshot'] | null>(null);
  const saveImage = () => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      return;
    }
    const title = [passage && formatPassage(passage, data.versification, books), t('app.name')]
      .filter((part) => part !== null)
      .join(' · ');
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    const canvas = snapshot((layers) =>
      composeImage(
        layers,
        {
          title,
          url: passage ? shareUrl(passage) : import.meta.env.SITE_URL,
          credit: data.crossReferences.manifest.attribution,
        },
        ratio,
        () => document.createElement('canvas'),
      ),
    );
    if (canvas instanceof HTMLCanvasElement) {
      downloadImage(canvas, imageFileName(title)).catch(() => {
        window.alert(t('image.failed'));
      });
    }
  };

  // The arcs need only the links; the words come when they come, and only what shows them waits.
  const text = data.text.state === 'loaded' ? data.text.translation : null;

  return (
    <VizPage
      masthead={masthead}
      credits={<Credits translation={data.translationManifest} inspiration={INSPIRATION} />}
      onPanelClose={closePanel}
      controls={
        <>
          <ReferenceSearch
            versification={data.versification}
            translation={text ?? undefined}
            textUnavailable={data.text.state === 'loaded' ? undefined : data.text.state}
            onSelect={onNavigate}
          />
          {translationMenu}
          <SavedMenu versification={data.versification} translation={text} onSelect={onNavigate} />
          <FiltersMenu
            filter={filter}
            defaults={DEFAULT_LINK_FILTER}
            onChange={onFilterChange}
            shownLinks={linkIds.length}
            totalLinks={index.linkCount}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
          />
          <button
            type="button"
            className={controls.button}
            aria-label={t('image.save')}
            title={t('image.save')}
            onClick={saveImage}
          >
            <SaveImageIcon />
          </button>
        </>
      }
      panel={
        passage && (
          <WithText data={data}>
            {(complete) => (
              <PassagePanel
                data={complete}
                passage={passage}
                filter={filter}
                actions={passageLinks(passage)}
                onSelect={onNavigate}
                onClose={closePanel}
                shareUrl={shareUrl}
                onPreview={(connection) => {
                  setPreview(connection && { passage, connection });
                }}
              />
            )}
          </WithText>
        )
      }
    >
      <ArcsStage
        data={data}
        active={active}
        linkIds={linkIds}
        filter={filter}
        focus={passage}
        preview={previewed}
        onSelect={onNavigate}
        snapshotRef={snapshotRef}
      />
      <LinkStats
        summary={summary}
        isFilterDefault={isDefaultFilter(filter, DEFAULT_LINK_FILTER)}
        onShowFilters={() => {
          setFiltersOpen(true);
        }}
        hint={{
          pointer: (
            <>
              <ScrollIcon /> {t('hint.zoom')} · <DragIcon /> {t('hint.pan')} · <ClickIcon />{' '}
              {t('hint.focus')}
            </>
          ),
          touch: (
            <>
              <HoldAndSlideIcon /> {t('hint.hold')} · <TapIcon /> {t('hint.focus')} · <PinchIcon />{' '}
              {t('hint.zoom')}
            </>
          ),
        }}
      />
      <GenreLegend
        hiddenGenres={filter.hiddenGenres}
        onToggle={(genre) => {
          onFilterChange({ ...filter, hiddenGenres: toggleGenre(filter.hiddenGenres, genre) });
        }}
      />
    </VizPage>
  );
}
