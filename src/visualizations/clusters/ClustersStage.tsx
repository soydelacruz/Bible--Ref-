import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { BookId } from '../../core/bible/books.ts';
import {
  formatPassage,
  passageRange,
  versePassage,
  type Passage,
} from '../../core/bible/passage.ts';
import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { PreviousIcon } from '../../shared/ui/icons.tsx';
import controls from '../shared/components/controls.module.css';
import { animate, MAX_PIXEL_RATIO } from '../shared/frames.ts';
import type { LinkFilter } from '../shared/link-filter.ts';
import { useElementSize } from '../shared/use-element-size.ts';
import type { VizData } from '../shared/viz-data.ts';
import {
  drawnLinks,
  groupHighlight,
  passageHighlight,
  type Highlight,
} from './cluster-highlight.ts';
import {
  computeClusterLayout,
  selectClusterGraph,
  targetAt,
  type ClusterGroup,
} from './cluster-layout.ts';
import { drawBase, drawOverlay } from './clusters-drawing.ts';
import styles from './ClustersStage.module.css';

interface ClustersStageProps {
  readonly data: VizData;
  /** Whether the view is on screen; a hidden one draws nothing. */
  readonly active: boolean;
  readonly filter: LinkFilter;
  /** The book shown chapter by chapter, or `null` for the whole Bible. */
  readonly openBook: BookId | null;
  readonly focus: Passage | null;
  readonly onSelect: (passage: Passage | null) => void;
  readonly onOpenBook: (book: BookId | null) => void;
}

interface Hover {
  readonly verse: VerseIndex | null;
  readonly group: number;
  readonly x: number;
  readonly y: number;
}

interface Emphasis {
  readonly highlight: Highlight;
  readonly strength: 'strong' | 'soft';
}

/** How long a passage's links take to grow out from it; a book's appear at once. */
const GROW_MS = 650;

/** Sizes a canvas's backing store to its box, for crisp lines on high-density screens. */
function prepare(canvas: HTMLCanvasElement | null, width: number, height: number) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

/** Every verse with links as a dot, in one cluster per book, with the links between them. */
export function ClustersStage({
  data,
  active,
  filter,
  openBook,
  focus,
  onSelect,
  onOpenBook,
}: ClustersStageProps) {
  const { t, n, books } = useLocalization();
  const { versification, crossReferences, verseGenres } = data;
  const { index } = crossReferences;
  const hostRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(hostRef);
  const [hover, setHover] = useState<Hover | null>(null);

  // The host keeps every view mounted, and a hidden one keeps its size: nothing is worked out
  // until the view is on screen, so the other views pay nothing for it.
  const graph = useMemo(
    () => (active ? selectClusterGraph(index, verseGenres, filter, versification, openBook) : null),
    [active, index, verseGenres, filter, versification, openBook],
  );
  const drawn = useMemo(() => graph && drawnLinks(index.linkCount, graph.linkIds), [index, graph]);
  const layout = useMemo(
    () =>
      graph && size.width > 0 && size.height > 0
        ? computeClusterLayout(graph, versification, openBook, size)
        : null,
    [graph, versification, openBook, size],
  );

  const focusStart = focus ? passageRange(focus, versification).start : null;
  const focusEnd = focus ? passageRange(focus, versification).end : null;
  const hoverVerse = hover?.verse ?? null;
  const hoverGroup = hover?.group ?? -1;

  const emphasis = useMemo((): Emphasis | null => {
    if (!layout || !graph || !drawn) return null;
    const range =
      hoverVerse !== null
        ? { start: hoverVerse, end: hoverVerse }
        : hoverGroup < 0 && focusStart !== null && focusEnd !== null
          ? { start: focusStart, end: focusEnd }
          : null;
    if (range) {
      return {
        highlight: passageHighlight(layout, index, drawn, range, filter, verseGenres),
        strength: 'strong',
      };
    }
    if (hoverGroup >= 0) {
      return {
        highlight: groupHighlight(layout, index, graph.linkIds, hoverGroup, verseGenres),
        strength: 'soft',
      };
    }
    return null;
  }, [
    layout,
    index,
    drawn,
    graph,
    filter,
    verseGenres,
    hoverVerse,
    hoverGroup,
    focusStart,
    focusEnd,
  ]);

  // The picture at rest: redrawn only when the layout or the language of its labels changes.
  useEffect(() => {
    if (!active || !layout || !graph) return;
    const context = prepare(baseRef.current, layout.width, layout.height);
    if (!context) return;
    const label = (group: ClusterGroup) =>
      group.chapter === null
        ? { full: books[group.book].name, short: books[group.book].abbreviation ?? group.book }
        : { full: String(group.chapter), short: String(group.chapter) };
    drawBase(context, {
      layout,
      index,
      linkIds: graph.linkIds,
      verseGenres,
      label,
      headings: {
        start: t('testament.OT'),
        end: t('testament.NT'),
        ...(openBook && { center: books[openBook].name }),
      },
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
  }, [active, layout, index, graph, verseGenres, books, t, openBook]);

  // What stands out: a passage's links grow out from it; a book's appear at once.
  useEffect(() => {
    if (!active || !layout) return undefined;
    const context = prepare(overlayRef.current, layout.width, layout.height);
    if (!context) return undefined;
    if (!emphasis) {
      context.clearRect(0, 0, layout.width, layout.height);
      return undefined;
    }
    const paint = (progress: number) => {
      drawOverlay(context, {
        layout,
        verseGenres,
        segments: emphasis.highlight.segments,
        marked: emphasis.highlight.marked,
        ringed: emphasis.highlight.ringed,
        strength: emphasis.strength,
        progress,
      });
    };
    const still =
      emphasis.strength === 'soft' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      paint(1);
      return undefined;
    }
    return animate(GROW_MS, paint);
  }, [active, layout, emphasis, verseGenres]);

  const point = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!layout || event.pointerType === 'touch') return;
    const { x, y } = point(event);
    const target = targetAt(layout, x, y);
    setHover(
      target && {
        verse: target.kind === 'verse' ? target.verse : null,
        group: target.group,
        x,
        y,
      },
    );
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!layout) return;
    const { x, y } = point(event);
    const target = targetAt(layout, x, y);
    const group = target && layout.groups[target.group];
    setHover(null);
    if (target?.kind === 'verse') {
      const { verse } = target;
      onSelect(focus?.kind === 'verse' && focus.verse === verse ? null : versePassage(verse));
    } else if (group && group.chapter !== null) {
      onSelect({ kind: 'chapter', book: group.book, chapter: group.chapter });
    } else if (group) {
      onOpenBook(group.book);
    } else {
      onSelect(null);
    }
  };

  const tooltip = (() => {
    if (!hover || !layout) return null;
    const count = emphasis?.highlight.segments.from.length ?? 0;
    const connections = t('arcs.connections')(n(count), count);
    if (hover.verse !== null) {
      return { title: formatPassage(versePassage(hover.verse), versification, books), connections };
    }
    const group = layout.groups[hover.group];
    if (!group) return null;
    const name = books[group.book].name;
    return group.chapter === null
      ? { title: name, connections: `${connections} · ${t('clusters.openBook')}` }
      : { title: `${name} ${String(group.chapter)}`, connections };
  })();

  return (
    <div
      ref={hostRef}
      className={styles.stage}
      data-pointing={hover !== null}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        setHover(null);
      }}
      onClick={onClick}
    >
      <canvas
        ref={baseRef}
        className={`${styles.canvas} ${styles.base}`}
        data-dimmed={emphasis !== null}
        role="img"
        aria-label={t('clusters.stage')}
      />
      <canvas
        ref={overlayRef}
        className={`${styles.canvas} ${styles.overlay}`}
        aria-hidden="true"
      />
      {tooltip && hover && (
        <div className={styles.tooltip} style={{ left: hover.x, top: hover.y }}>
          {tooltip.title} <span>· {tooltip.connections}</span>
        </div>
      )}
      {openBook && (
        <button
          type="button"
          className={`${controls.button} ${styles.back}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenBook(null);
          }}
        >
          <PreviousIcon />
          {t('clusters.wholeBible')}
        </button>
      )}
      <p className={`${styles.hint} ${styles.pointerHint}`}>{t('clusters.hint')}</p>
      <p className={`${styles.hint} ${styles.touchHint}`}>{t('clusters.hint.touch')}</p>
    </div>
  );
}
