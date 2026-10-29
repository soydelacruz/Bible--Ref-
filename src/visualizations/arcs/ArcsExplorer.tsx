import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ClickIcon,
  DragIcon,
  HoldAndSlideIcon,
  PinchIcon,
  PlayIcon,
  SaveImageIcon,
  SaveVideoIcon,
  ScrollIcon,
  TapIcon,
} from '../../shared/ui/icons.tsx';
import { Credits } from '../shared/components/Credits.tsx';
import { FiltersMenu } from '../shared/components/FiltersMenu.tsx';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { GenreMenu } from '../shared/components/GenreMenu.tsx';
import { toggleGenre } from '../shared/components/GenreToggles.tsx';
import { LinkStats } from '../shared/components/LinkStats.tsx';
import { PassagePanel } from '../shared/components/PassagePanel.tsx';
import { SavedMenu } from '../shared/components/SavedMenu.tsx';
import { ReferenceSearch } from '../shared/components/ReferenceSearch.tsx';
import { WithText } from '../shared/components/TextPending.tsx';
import { VizPage } from '../shared/components/VizPage.tsx';
import { DEFAULT_LINK_FILTER, isDefaultFilter, selectLinks } from '../shared/link-filter.ts';
import { summarizeLinks } from '../shared/link-summary.ts';
import { PathLight } from '../shared/path-light.ts';
import { formatPassage, type Passage } from '../../core/bible/passage.ts';
import controls from '../shared/components/controls.module.css';
import { MAX_PIXEL_RATIO } from '../shared/frames.ts';
import { composeImage, downloadImage, imageFileName } from '../shared/image-export.ts';
import type { Connection } from '../shared/connections.ts';
import type { EarlyVizData } from '../shared/viz-data.ts';
import type { VisualizationProps } from '../visualization.ts';
import { buildArcPath } from './arc-path.ts';
import type { ArcsController } from './arcs-controller.ts';
import { ArcsStage } from './ArcsStage.tsx';
import { clipFileName, supportedClipType } from './clip/clip-format.ts';
import { ClipJob } from './clip/clip-job.ts';
import { makeClip } from './clip/clip-painter.ts';
import { buildClipScene } from './clip/clip-scene.ts';
import { ClipStatus } from './clip/ClipStatus.tsx';
import clipStyles from './clip/ClipStatus.module.css';
import { TourLayer } from './tour/ArcsTour.tsx';
import tourStyles from './tour/ArcsTour.module.css';
import { useArcsTour } from './tour/use-arcs-tour.ts';

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
  const { t, books, locale } = useLocalization();
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
  // A path the panel finds travels the arcs as light.
  const [pathLight] = useState(() => new PathLight());
  const controllerRef = useRef<ArcsController | null>(null);
  // A guided tour of a few famous links, offered on a first visit and from the hint line after.
  // Its finale travels a chain of cross-references as the same light.
  const tour = useArcsTour({
    data,
    filter,
    active,
    passage,
    onNavigate,
    camera: controllerRef,
    playPath: (steps, signal) =>
      controllerRef.current?.playPath(buildArcPath(index, steps, data.verseGenres), { signal }) ??
      Promise.resolve(false),
  });
  const touring = tour.run !== null;
  const tourEntry = tour.available && (
    <span className={tourStyles.hintEntry}>
      {' · '}
      <button type="button" className={tourStyles.hintButton} onClick={tour.start}>
        <PlayIcon />
        {t('tour.start')}
      </button>
    </span>
  );
  // What the picture and the clip say they show, and name their files after.
  const exportTitle = [passage && formatPassage(passage, data.versification, books), t('app.name')]
    .filter((part) => part !== null)
    .join(' · ');
  const saveImage = () => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      return;
    }
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    const canvas = snapshot((layers) =>
      composeImage(
        layers,
        {
          title: exportTitle,
          url: passage ? shareUrl(passage) : import.meta.env.SITE_URL,
          credit: data.crossReferences.manifest.attribution,
        },
        ratio,
        () => document.createElement('canvas'),
      ),
    );
    if (canvas instanceof HTMLCanvasElement) {
      downloadImage(canvas, imageFileName(exportTitle)).catch(() => {
        window.alert(t('image.failed'));
      });
    }
  };

  // The arcs need only the links; the words come when they come, and only what shows them waits.
  const text = data.text.state === 'loaded' ? data.text.translation : null;

  // A short video of the focused passage, drawn apart from the diagram. Offered only where the
  // browser can record one; the format it would be is settled once.
  const [clipType] = useState(supportedClipType);
  const [clipJob] = useState(() => new ClipJob());
  const isClipRecording = useSyncExternalStore(clipJob.subscribe, clipJob.isRecording);
  // A clip plays on the page while it is recorded: putting the view away stops it.
  useEffect(() => {
    if (!active) {
      clipJob.cancel();
    }
  }, [active, clipJob]);
  useEffect(
    () => () => {
      clipJob.cancel();
    },
    [clipJob],
  );
  const saveClip = () => {
    if (!passage || !clipType || clipJob.isRecording()) {
      return;
    }
    const scene = buildClipScene({
      core: data,
      passage,
      filter,
      translation: text,
      names: books,
      genreNames: locale.genres,
      caption: {
        title: exportTitle,
        url: shareUrl(passage),
        credit: data.crossReferences.manifest.attribution,
      },
    });
    clipJob.start(
      (onProgress) => makeClip(scene, clipType, onProgress),
      clipFileName(exportTitle, clipType),
    );
  };

  return (
    <VizPage
      masthead={masthead}
      credits={<Credits translation={data.translationManifest} inspiration={INSPIRATION} />}
      onPanelClose={closePanel}
      search={
        <ReferenceSearch
          versification={data.versification}
          translation={text ?? undefined}
          textUnavailable={data.text.state === 'loaded' ? undefined : data.text.state}
          onSelect={onNavigate}
        />
      }
      tools={
        <>
          {translationMenu}
          <SavedMenu versification={data.versification} translation={text} onSelect={onNavigate} />
          <GenreMenu
            hiddenGenres={filter.hiddenGenres}
            onToggle={(genre) => {
              onFilterChange({ ...filter, hiddenGenres: toggleGenre(filter.hiddenGenres, genre) });
            }}
          />
          <button
            type="button"
            className={controls.button}
            aria-label={t('image.save')}
            title={t('image.save')}
            onClick={saveImage}
          >
            <SaveImageIcon />
            {/* Its icon alone in the header; spelled out as a row of the phone's More menu. */}
            <span className={controls.rowLabel}>{t('image.save')}</span>
          </button>
          {passage && clipType && (
            <button
              type="button"
              className={`${controls.button} ${clipStyles.saving}`}
              aria-label={t('clip.save')}
              title={t('clip.save')}
              aria-busy={isClipRecording || undefined}
              onClick={saveClip}
            >
              <SaveVideoIcon />
              <span className={controls.rowLabel}>{t('clip.save')}</span>
            </button>
          )}
        </>
      }
      filters={
        <FiltersMenu
          filter={filter}
          defaults={DEFAULT_LINK_FILTER}
          onChange={onFilterChange}
          shownLinks={linkIds.length}
          totalLinks={index.linkCount}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        />
      }
      moreChanged={filter.hiddenGenres.size > 0}
      // The arcs have no toolbar of their own: their one control, the tour, is offered at the end
      // of the hint line, and here, as a row of the More menu on narrower screens.
      viewTools={
        tour.available && (
          <button type="button" className={controls.button} onClick={tour.start}>
            <PlayIcon />
            <span className={controls.rowLabel}>{t('tour.start')}</span>
          </button>
        )
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
                pathLight={pathLight}
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
        onSelect={tour.select}
        snapshotRef={snapshotRef}
        pathLight={pathLight}
        controllerRef={controllerRef}
        touring={touring}
      />
      <ClipStatus job={clipJob} />
      <TourLayer
        run={tour.run}
        inviting={tour.inviting}
        versification={data.versification}
        layerRef={tour.layerRef}
        cardRef={tour.cardRef}
        fadeRef={tour.fadeRef}
        onStart={tour.start}
        onDismiss={tour.dismiss}
        onPause={tour.pause}
        onResume={tour.resume}
        onClose={tour.close}
      />
      <div className={tourStyles.chrome} data-touring={touring || undefined}>
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
                {tourEntry}
              </>
            ),
            touch: (
              <>
                <HoldAndSlideIcon /> {t('hint.hold')} · <TapIcon /> {t('hint.focus')} ·{' '}
                <PinchIcon /> {t('hint.zoom')}
                {tourEntry}
              </>
            ),
          }}
        />
      </div>
    </VizPage>
  );
}
