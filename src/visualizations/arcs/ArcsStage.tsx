import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { formatPassage, passageRange, type Passage } from '../../core/bible/passage.ts';
import type { VerseIndexRange } from '../../core/bible/versification.ts';
import { ClickIcon, PinchIcon, TapIcon } from '../../shared/ui/icons.tsx';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { collectConnections, connectionLinkIds, type Connection } from '../shared/connections.ts';
import type { LinkFilter } from '../shared/link-filter.ts';
import { useAnnouncer } from '../shared/use-announcer.ts';
import { useElementSize } from '../shared/use-element-size.ts';
import type { VizCore } from '../shared/viz-data.ts';
import { buildArcInstances, buildArcMorph } from './arc-instances.ts';
import { computeArcLayout } from './arc-layout.ts';
import { ArcsController, type ArcHover } from './arcs-controller.ts';
import { describeBooks, linksTouching } from './minimap-strip.ts';
import { Minimap, type ViewListener } from './Minimap.tsx';
import styles from './ArcsStage.module.css';

const NO_LINKS = new Int32Array(0);

interface ArcsStageProps {
  readonly data: VizCore;
  /** Whether it's on screen; hidden, it doesn't draw. */
  readonly active: boolean;
  /** Links that pass the filter, drawn as the background. */
  readonly linkIds: Int32Array;
  readonly filter: LinkFilter;
  readonly focus: Passage | null;
  /** A connection pointed at in the details panel: its arc and its whole passage stand out. */
  readonly preview: Connection | null;
  readonly onSelect: (passage: Passage | null) => void;
  /** Filled with a way to take a picture of the diagram as it is, once it can be drawn. */
  readonly snapshotRef?: RefObject<ArcsController['snapshot'] | null>;
}

/**
 * The arc diagram: a WebGL layer for arcs, a 2D overlay for the axis, a hover tooltip, and the
 * minimap beside the axis — under it, or down the side of a phone's upright one.
 */
export function ArcsStage({
  data,
  active,
  linkIds,
  filter,
  focus,
  preview,
  onSelect,
  snapshotRef,
}: ArcsStageProps) {
  const { t, books, locale, n } = useLocalization();
  const genres = locale.genres;
  // The axis needs names to paint its first frame, but a change of language must not tear down
  // the WebGL context: the effect below hands the controller the new ones instead.
  const namesRef = useRef({ books, genres });
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ArcsController | null>(null);
  const viewListenerRef = useRef<ViewListener | null>(null);
  const frameSize = useElementSize(frameRef);
  const size = useElementSize(containerRef);
  // The strip runs beside the axis, so the axis's way decides its place. Taken from the whole
  // frame, the stage left beside the strip always lays its axis out the same way.
  const { orientation } = computeArcLayout(frameSize.width, frameSize.height);
  const [hover, setHover] = useState<ArcHover | null>(null);
  const [announcer, announce] = useAnnouncer<HTMLParagraphElement>();

  // Books brushed on the minimap light up in the focused passage's place. They belong to the
  // passage they were brushed over: opening another clears them, as the newest thing asked for.
  const [brushed, setBrushed] = useState<{
    readonly range: VerseIndexRange;
    readonly over: Passage | null;
  } | null>(null);
  const brush = brushed?.over === focus ? brushed.range : null;
  const { index } = data.crossReferences;
  const brushLinks = useMemo(
    () => brush && linksTouching(index, linkIds, brush),
    [brush, index, linkIds],
  );
  const brushBooks = (range: VerseIndexRange | null) => {
    setBrushed(range && { range, over: focus });
    if (range) {
      const count = linksTouching(index, linkIds, range).length;
      announce(
        t('arcs.minimap.lit')(
          describeBooks(range, data.versification, books),
          t('arcs.connections')(n(count), count),
        ),
      );
    } else if (brush) {
      announce(t('arcs.minimap.cleared'));
    }
  };

  const select = useEffectEvent((passage: Passage | null) => {
    setBrushed(null);
    onSelect(passage);
  });
  // Escape on the stage puts away what was asked for last: lit books, then the passage.
  const clear = useEffectEvent(() => {
    if (brush) {
      brushBooks(null);
    } else {
      onSelect(null);
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    const glCanvas = glCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!container || !glCanvas || !overlayCanvas) {
      return undefined;
    }
    const controller = new ArcsController({
      container,
      glCanvas,
      overlayCanvas,
      versification: data.versification,
      names: namesRef.current.books,
      genreNames: namesRef.current.genres,
      onHover: setHover,
      onSelect: (passage) => {
        select(passage);
      },
      onClear: () => {
        clear();
      },
    });
    controller.setViewListener((view, layout) => {
      viewListenerRef.current?.(view, layout);
    });
    controllerRef.current = controller;
    if (snapshotRef) {
      snapshotRef.current = (compose) => controller.snapshot(compose);
    }
    return () => {
      controller.dispose();
      controllerRef.current = null;
      if (snapshotRef) {
        snapshotRef.current = null;
      }
    };
  }, [data.versification, snapshotRef]);

  useEffect(() => {
    namesRef.current = { books, genres };
    controllerRef.current?.setNames(books, genres);
  }, [books, genres]);

  useEffect(() => {
    controllerRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    controllerRef.current?.setSize(size.width, size.height);
  }, [size]);

  // The links drawn so far, so a change of filter can morph from them to the new ones.
  const drawnLinksRef = useRef<{ readonly data: VizCore; readonly ids: Int32Array } | null>(null);
  useEffect(() => {
    const drawn = drawnLinksRef.current;
    const before = drawn?.data === data ? drawn.ids : NO_LINKS;
    drawnLinksRef.current = { data, ids: linkIds };
    controllerRef.current?.setLinks(
      buildArcMorph(data.crossReferences.index, before, linkIds, data.verseGenres),
    );
  }, [data, linkIds]);

  useEffect(() => {
    const { index } = data.crossReferences;
    controllerRef.current?.setLinkResolver((range) =>
      buildArcInstances(
        index,
        connectionLinkIds(collectConnections(index, range, filter, data.verseGenres)),
        data.verseGenres,
      ),
    );
  }, [data, filter]);

  // After the link resolver, which re-resolves the passage's links into the focus, and before the
  // focus, so that clearing the books for a newly opened passage never cuts its links' growth.
  useEffect(() => {
    controllerRef.current?.setBrush(
      brush,
      brushLinks && buildArcInstances(index, brushLinks, data.verseGenres),
    );
  }, [brush, brushLinks, index, data.verseGenres]);

  useEffect(() => {
    controllerRef.current?.setFocus(focus && passageRange(focus, data.versification));
  }, [focus, data.versification]);

  useEffect(() => {
    const link = preview?.link;
    controllerRef.current?.setPreview(
      link
        ? {
            links: buildArcInstances(
              data.crossReferences.index,
              Int32Array.of(link.id),
              data.verseGenres,
            ),
            passage: { start: link.targetStart, end: link.targetEnd },
          }
        : null,
    );
  }, [preview, data]);

  return (
    <div ref={frameRef} className={styles.frame} data-orientation={orientation}>
      <div
        ref={containerRef}
        className={styles.stage}
        tabIndex={0}
        role="application"
        aria-label={t('arcs.stage')}
      >
        <canvas ref={glCanvasRef} className={styles.canvas} />
        <canvas ref={overlayCanvasRef} className={styles.canvas} aria-hidden="true" />
        {hover && <HoverTooltip hover={hover} data={data} filter={filter} size={size} />}
      </div>
      <Minimap
        controllerRef={controllerRef}
        viewListenerRef={viewListenerRef}
        versification={data.versification}
        orientation={orientation}
        brush={brush}
        onBrush={brushBooks}
      />
      <p ref={announcer} className={styles.visuallyHidden} role="status" />
    </div>
  );
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Gap between a mouse pointer and its tooltip. */
const MOUSE_OFFSET_PX = 14;
/** A finger hides what's under it, so its tooltip floats this far above, like iOS's loupe. */
const FINGER_CLEARANCE_PX = 56;
/** The tooltip never comes closer than this to the stage's edges. */
const EDGE_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Places the tooltip from its measured size. Beside a mouse pointer (below and to the right, or
 * the other side near an edge); centered above a finger, or below it when there is no room.
 */
function placeTooltip(tooltip: HTMLElement, hover: ArcHover, stage: Size): void {
  const { offsetWidth: width, offsetHeight: height } = tooltip;
  let left: number;
  let top: number;
  if (hover.input === 'mouse') {
    left = hover.x + MOUSE_OFFSET_PX;
    if (left + width > stage.width - EDGE_PX) {
      left = hover.x - MOUSE_OFFSET_PX - width;
    }
    top = hover.y + MOUSE_OFFSET_PX;
    if (top + height > stage.height - EDGE_PX) {
      top = hover.y - MOUSE_OFFSET_PX - height;
    }
  } else {
    left = hover.x - width / 2;
    top = hover.y - FINGER_CLEARANCE_PX - height;
    if (top < EDGE_PX) {
      top = hover.y + FINGER_CLEARANCE_PX;
    }
  }
  tooltip.style.left = `${String(clamp(left, EDGE_PX, stage.width - width - EDGE_PX))}px`;
  tooltip.style.top = `${String(clamp(top, EDGE_PX, stage.height - height - EDGE_PX))}px`;
}

function HoverTooltip({
  hover,
  data,
  filter,
  size,
}: {
  readonly hover: ArcHover;
  readonly data: VizCore;
  readonly filter: LinkFilter;
  readonly size: Size;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { versification, crossReferences, verseGenres } = data;
  const { t, books, n } = useLocalization();
  const count = useMemo(() => {
    const connections = collectConnections(
      crossReferences.index,
      passageRange(hover.passage, versification),
      filter,
      verseGenres,
    );
    return connectionLinkIds(connections).length;
  }, [crossReferences.index, hover.passage, versification, filter, verseGenres]);
  // After every render: the content, and so the size, changes with the passage. Before paint, so
  // the tooltip never shows in the wrong place.
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      placeTooltip(tooltipRef.current, hover, size);
    }
  });
  return (
    <div ref={tooltipRef} className={styles.tooltip} data-input={hover.input}>
      <strong>{formatPassage(hover.passage, versification, books)}</strong>
      <span>{t('arcs.connections')(n(count), count)}</span>
      <span className={styles.gestures}>
        {hover.input === 'touch' ? <TapIcon /> : <ClickIcon />} {t('hint.focus')} · <PinchIcon />{' '}
        {t('hint.zoom')}
      </span>
    </div>
  );
}
