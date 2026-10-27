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
import { MAX_PIXEL_RATIO } from '../shared/frames.ts';
import type { LinkFilter } from '../shared/link-filter.ts';
import { PathLayer } from '../shared/path-layer.ts';
import { pathMode, type PathLight } from '../shared/path-light.ts';
import { useElementSize } from '../shared/use-element-size.ts';
import type { VizCore } from '../shared/viz-data.ts';
import {
  blendLabels,
  createGlideFrame,
  easeOutCubic,
  frameLayout,
  FramePace,
  GLIDE_MS,
  glideEase,
  HOVER_GROW_MS,
  isStill,
  planGlide,
  playFrames,
  sceneMidGlide,
  writeGlideFrame,
  type ShownScene,
} from './cluster-glide.ts';
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
import {
  CLUSTER_PATH_TRACE,
  clusterPathCurve,
  clusterPathHops,
  type ClusterPathHop,
} from './cluster-path.ts';
import {
  drawBase,
  drawGlideLabels,
  drawOverlay,
  GlideRenderer,
  hazeAlpha,
  placeLabels,
  type BaseScene,
} from './clusters-drawing.ts';
import styles from './ClustersStage.module.css';

interface ClustersStageProps {
  readonly data: VizCore;
  /** Whether the view is on screen; a hidden one draws nothing. */
  readonly active: boolean;
  readonly filter: LinkFilter;
  /** The book shown chapter by chapter, or `null` for the whole Bible. */
  readonly openBook: BookId | null;
  readonly focus: Passage | null;
  readonly onSelect: (passage: Passage | null) => void;
  readonly onOpenBook: (book: BookId | null) => void;
  /** A chain of links the details panel shows, to travel between its dots as light. */
  readonly pathLight?: PathLight;
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

/** How long a passage's links take to grow out from it; a book's only swell in (`HOVER_GROW_MS`). */
const GROW_MS = 650;

/** A reader who asked for less motion sees each picture at once: no glide, no growing links. */
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Device pixels per CSS pixel the canvases draw at. */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
}

/** Sizes a canvas's backing store to its box, for crisp lines on high-density screens. */
function prepare(canvas: HTMLCanvasElement | null, width: number, height: number) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  const ratio = pixelRatio();
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
  pathLight,
}: ClustersStageProps) {
  const { t, n, books } = useLocalization();
  const { versification, crossReferences, verseGenres } = data;
  const { index } = crossReferences;
  const hostRef = useRef<HTMLDivElement>(null);
  const glideRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pathCanvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(hostRef);
  const [hover, setHover] = useState<Hover | null>(null);
  // What the base canvas shows now, at rest or mid-glide: where the next glide sets off from, and
  // where what stands out is drawn.
  const shownRef = useRef<ShownScene | null>(null);
  // Repaints what stands out, for a glide to call as the dots move under it.
  const repaintOverlayRef = useRef<(() => void) | null>(null);
  // A path's light, over everything else, and how to move it with the dots as they glide.
  const pathLayerRef = useRef<PathLayer<ClusterPathHop> | null>(null);
  const repaintPathRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(active);
  // Draws the gliding dots and links; made at the first glide, `null` until then or without WebGL.
  const rendererRef = useRef<GlideRenderer | null | undefined>(undefined);
  // While the dots glide they are nowhere a pointer can rely on: what is under it is worked out
  // from where they land, so pointing waits until they have.
  const glidingRef = useRef(false);

  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
    },
    [],
  );

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

  // The picture: drawn at rest, or, when the layout changes under it (a book opened or closed, a
  // filter, a new size), glided there from where its dots are now, each verse moving as itself.
  useEffect(() => {
    if (!active || !layout || !graph) {
      // A view coming back is drawn as it is, not glided into from how it was when it left.
      shownRef.current = null;
      return undefined;
    }
    const context = prepare(baseRef.current, layout.width, layout.height);
    if (!context) return undefined;
    const label = (group: ClusterGroup) =>
      group.chapter === null
        ? { full: books[group.book].name, short: books[group.book].abbreviation ?? group.book }
        : { full: String(group.chapter), short: String(group.chapter) };
    const scene: BaseScene = {
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
    };
    const target: ShownScene = {
      layout,
      linkIds: graph.linkIds,
      labels: placeLabels(context, scene),
    };
    // The picture at rest, drawn on this canvas alone once the glide (if any) has landed.
    const glideCanvas = glideRef.current;
    const rest = () => {
      rendererRef.current?.clear();
      glideCanvas?.removeAttribute('data-gliding');
      glidingRef.current = false;
      drawBase(context, scene, target.labels);
      shownRef.current = target;
      repaintOverlayRef.current?.();
      repaintPathRef.current?.();
    };
    const from = shownRef.current;
    if (!from || from.layout === layout || !glideCanvas || reducedMotion()) {
      rest();
      return undefined;
    }
    const haze = { from: hazeAlpha(from.linkIds.length), to: hazeAlpha(graph.linkIds.length) };
    const plan = planGlide(from, target, index, haze);
    if (isStill(plan, layout)) {
      rest();
      return undefined;
    }
    rendererRef.current ??= GlideRenderer.create(glideCanvas);
    const renderer = rendererRef.current;
    if (!renderer) {
      rest();
      return undefined;
    }
    renderer.load(plan, layout, verseGenres, pixelRatio());
    glideCanvas.setAttribute('data-gliding', '');
    glidingRef.current = true;
    const frame = createGlideFrame(plan);
    let landed = false;
    let landing: number | null = null;
    let drawn = 0;
    const pace = new FramePace(performance.now());
    const paint = (linear: number) => {
      if (landed) return;
      const progress = glideEase(linear);
      const keepingUp = linear === 0 || !pace.tooSlow(performance.now());
      if (!keepingUp || !renderer.draw(progress)) {
        landed = true;
        rest();
        return;
      }
      drawn = progress;
      writeGlideFrame(plan, layout, progress, frame);
      const labels = blendLabels(from.labels, target.labels, progress);
      drawGlideLabels(context, layout, labels, scene.fontFamily);
      shownRef.current = { ...target, layout: frameLayout(plan, layout, frame, progress) };
      repaintOverlayRef.current?.();
      repaintPathRef.current?.();
      // The glide lands on the picture at rest, drawn a frame after its last: tracing every link
      // and dot again can hold a phone up for a while, and this way it holds up a still picture.
      if (linear >= 1) {
        landed = true;
        landing = requestAnimationFrame(rest);
      }
    };
    // Sizing the canvas cleared it: the first frame is drawn now, not after a blank one.
    paint(0);
    const stop = playFrames(GLIDE_MS, paint);
    return () => {
      stop();
      if (landing !== null) cancelAnimationFrame(landing);
      // A glide cut short (by a resize, another book) hands on the picture as it stands, fading
      // dots and links and part-way names included, for the next glide to carry on from.
      if (!landed) shownRef.current = sceneMidGlide(plan, from, target, frame, drawn);
      // Whatever comes next (another glide, the picture at rest, or nothing while the view is
      // away) is drawn from scratch, so a glide cut short leaves nothing behind on this canvas.
      rendererRef.current?.clear();
      glideCanvas.removeAttribute('data-gliding');
      glidingRef.current = false;
    };
  }, [active, layout, index, graph, verseGenres, books, t, openBook]);

  // What stands out: a passage's links grow out from it; a book's appear at once. Either swells
  // in quickly under the pointer, and follows the dots while they glide.
  useEffect(() => {
    if (!active || !layout) return undefined;
    const context = prepare(overlayRef.current, layout.width, layout.height);
    if (!context) return undefined;
    if (!emphasis) {
      context.clearRect(0, 0, layout.width, layout.height);
      return undefined;
    }
    const still = reducedMotion();
    const soft = emphasis.strength === 'soft';
    let progress = still || soft ? 1 : 0;
    let grow = still ? 1 : 0;
    const paint = () => {
      // Mid-glide the dots are not yet where the layout puts them; this is drawn where they are.
      const shown = shownRef.current?.layout;
      drawOverlay(context, {
        layout: shown?.nodes === layout.nodes ? shown : layout,
        verseGenres,
        segments: emphasis.highlight.segments,
        marked: emphasis.highlight.marked,
        ringed: emphasis.highlight.ringed,
        strength: emphasis.strength,
        progress,
        grow,
      });
    };
    repaintOverlayRef.current = paint;
    const forget = () => {
      if (repaintOverlayRef.current === paint) repaintOverlayRef.current = null;
    };
    paint();
    if (still) return forget;
    const duration = soft ? HOVER_GROW_MS : GROW_MS;
    const stop = playFrames(duration, (linear) => {
      if (!soft) progress = easeOutCubic(linear);
      grow = easeOutCubic(Math.min(1, (linear * duration) / HOVER_GROW_MS));
      paint();
    });
    return () => {
      stop();
      forget();
    };
  }, [active, layout, emphasis, verseGenres]);

  // A chain shown in the details panel: its light travels from dot to dot on a canvas of its own,
  // drawn where the dots are, mid-glide too. Out of sight it lands at once.
  useEffect(() => {
    const canvas = pathCanvasRef.current;
    if (!canvas) return undefined;
    const layer = new PathLayer<ClusterPathHop>(canvas, CLUSTER_PATH_TRACE);
    pathLayerRef.current = layer;
    return () => {
      layer.dispose();
      pathLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) pathLayerRef.current?.finish();
  }, [active]);

  useEffect(() => {
    const layer = pathLayerRef.current;
    if (!active || !layout || !layer) return undefined;
    layer.setSize(layout.width, layout.height);
    const paint = () => {
      const shown = shownRef.current?.layout;
      const dots = shown?.nodes === layout.nodes ? shown : layout;
      layer.setCurves((hop) => clusterPathCurve(dots, verseGenres, hop));
    };
    repaintPathRef.current = paint;
    paint();
    return () => {
      if (repaintPathRef.current === paint) repaintPathRef.current = null;
    };
  }, [active, layout, verseGenres]);

  useEffect(() => {
    const layer = pathLayerRef.current;
    if (!pathLight || !layer) return undefined;
    return pathLight.attach((steps, options) =>
      layer.play(clusterPathHops(index, steps), pathMode(activeRef.current), options),
    );
  }, [pathLight, index]);

  const point = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!layout || event.pointerType === 'touch') return;
    if (glidingRef.current) {
      setHover(null);
      return;
    }
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
    if (!layout || glidingRef.current) return;
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
        ref={glideRef}
        className={`${styles.canvas} ${styles.base} ${styles.glide}`}
        data-dimmed={emphasis !== null}
        aria-hidden="true"
      />
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
      <canvas
        ref={pathCanvasRef}
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
