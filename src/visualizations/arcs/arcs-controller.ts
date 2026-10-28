import { chapterPassageOf, versePassage, type Passage } from '../../core/bible/passage.ts';
import type { GenreId } from '../../core/bible/genres.ts';
import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import type { VerseIndexRange, Versification } from '../../core/bible/versification.ts';
import type { BookNames } from '../../i18n/books/types.ts';
import {
  attachGestures,
  type GesturePoint,
  type GestureVelocity,
  type PreviewInput,
} from '../shared/gestures.ts';
import {
  animate,
  easeInOutCubic,
  easeOutCubic,
  FrameScheduler,
  MAX_PIXEL_RATIO,
  prefersReducedMotion,
  simulate,
} from '../shared/frames.ts';
import { isAtRest, rubberBand, stepGlide } from '../shared/momentum.ts';
import {
  clipBox,
  provideLocator,
  type PassageSpot,
  type ScreenBox,
} from '../shared/passage-spot.ts';
import { PathLayer } from '../shared/path-layer.ts';
import { pathMode, type PathPlayOptions } from '../shared/path-light.ts';
import { morphChanges, settleArcMorph, type ArcInstances, type ArcMorph } from './arc-instances.ts';
import {
  alongOfPoint,
  alongToVerse,
  computeArcLayout,
  pixelsPerVerse,
  verseToAlong,
  type ArcLayout,
} from './arc-layout.ts';
import { ARC_PATH_TRACE, arcPathCurve, type ArcPath, type ArcPathHop } from './arc-path.ts';
import { ArcScene } from './arc-scene.ts';
import {
  clampView,
  fullView,
  MIN_VIEW_SPAN,
  panView,
  revealRange,
  zoomView,
  type AxisView,
} from './axis-view.ts';
import { paintAxis } from './axis-painter.ts';
import { flightDuration, planFlight } from './camera-flight.ts';

export interface ArcHover {
  readonly passage: Passage;
  /** Pointer position in stage coordinates, for placing a tooltip. */
  readonly x: number;
  readonly y: number;
  /** A mouse, or a finger, whose tooltip must stay clear of the finger. */
  readonly input: PreviewInput;
}

/** One link shown from outside the diagram (e.g. pointed at in the details panel). */
export interface ArcPreview {
  /** The link's arc. */
  readonly links: ArcInstances;
  /** The passage it points to, marked on the axis as a whole. */
  readonly passage: VerseIndexRange;
}

export interface ArcsControllerOptions {
  /** Receives pointer, wheel and keyboard input; should be focusable. */
  readonly container: HTMLElement;
  readonly glCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly versification: Versification;
  /** Book and genre names for the axis; replaced when the reader changes language. */
  readonly names: BookNames;
  readonly genreNames: Readonly<Record<GenreId, string>>;
  readonly onHover: (hover: ArcHover | null) => void;
  readonly onSelect: (passage: Passage) => void;
  readonly onClear: () => void;
  /**
   * The part of the screen the stage is seen through, where the stage is larger than that (slid
   * up under a phone's details sheet): passages are in sight only inside it.
   */
  readonly visibleBox?: () => ScreenBox;
}

/** Below this many pixels per verse, pointing picks whole chapters instead of single verses. */
const VERSE_PICK_PIXELS = 4;
const KEYBOARD_PAN_SHARE = 0.15;
const KEYBOARD_ZOOM = 1.6;
/**
 * A key's step is a short tween, in ms. Steps chain from where the last one lands, so a key held
 * down moves the view at a steady pace, the same share of the screen at any zoom.
 */
const KEY_STEP_MS = 160;
const DOUBLE_TAP_ZOOM = 3;
/**
 * The mouse wheel's notches are smoothed out: what is left of their zoom shrinks by 1/e every this
 * many ms, so it settles within about 200ms without ever overshooting.
 */
const WHEEL_TIME_CONSTANT_MS = 60;
/** A wheel zoom with less than this left (as the log of its factor) is done. */
const WHEEL_REST = 0.001;
/** Slower than this, in px/ms, a released drag stays put instead of coasting. */
const MIN_FLICK_SPEED = 0.15;
/** How long the background takes to dim when a passage is focused, or brighten again, in ms. */
const DIM_MS = 200;
/**
 * How long a focused passage's links take to grow out of it, in ms. Focusing another one sooner
 * than this after the last shows it at once: the reader is moving quickly.
 */
const FOCUS_GROW_MS = 300;
/** With reduced motion, a focused passage's links fade in over this instead, in ms. */
const FOCUS_FADE_MS = 150;
/** How long links take to sink into the axis or rise out of it when the filter changes, in ms. */
const MORPH_MS = 250;
/** Keys that only modify others: pressing one alone doesn't make the keyboard the input. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * Accumulated light at which the glow saturates. The densest regions hold roughly one arc in 250
 * of the visible ones, so the ceiling follows the link count and any filter looks balanced.
 */
export function glowCeiling(arcCount: number): number {
  return Math.max(arcCount / 250, 20);
}

/** Length of the intro that grows the arcs, in ms: quick, so it never holds anyone up. */
const INTRO_MS = 800;

/**
 * A finger put down this close to the axis line, or on its labels, previews at once: the axis
 * works like an index strip. Elsewhere a finger previews after a hold, since a drag pans.
 */
const AXIS_STRIP_REACH_PX = 16;
/**
 * While a finger previews within this distance of an end of the axis, the view keeps panning that
 * way, faster the closer it gets, so a zoomed-in reader can scrub past the edge.
 */
const EDGE_PAN_ZONE_PX = 44;
/** Top edge-panning speed, in pixels per second. */
const EDGE_PAN_MAX_SPEED = 900;

/** Something moving the camera on its own. One at a time; any input stops it. */
interface CameraMotion {
  /** A flight somewhere, a key's step, a released drag gliding, or the wheel's smoothing. */
  readonly kind: 'flight' | 'step' | 'glide' | 'wheel';
  /** Where it lands, when that's known in advance. */
  readonly target: AxisView | null;
  readonly cancel: () => void;
}

const sameView = (a: AxisView, b: AxisView) => a.start === b.start && a.end === b.end;

/**
 * Drives the arc diagram imperatively (no React re-renders on every wheel tick): it owns the
 * WebGL scene, the 2D overlay, the visible window, and all input handling.
 */
export class ArcsController {
  readonly #options: ArcsControllerOptions;
  readonly #scene: ArcScene;
  readonly #overlay: CanvasRenderingContext2D;
  readonly #scheduler: FrameScheduler;
  readonly #detachGestures: () => void;
  #layout: ArcLayout = computeArcLayout(0, 0);
  /** The visible window at rest: always within the canon. */
  #view: AxisView;
  /**
   * How far a drag has pulled the window past an end of the canon, in px along the axis
   * (negative: before Genesis). Only what `rubberBand` lets through shows.
   */
  #overscroll = 0;
  /** A finger or the mouse is down: its drags may pull past the ends; the wheel's never do. */
  #pressed = false;
  #motion: CameraMotion | null = null;
  /** The zoom the wheel still has to do, as the log of its factor, and around which point. */
  #wheelZoom = 0;
  #wheelAnchor: GesturePoint = { x: 0, y: 0 };
  #names: BookNames;
  #genreNames: Readonly<Record<GenreId, string>>;
  #focus: VerseIndexRange | null = null;
  #hover: VerseIndexRange | null = null;
  #linkPreview: ArcPreview | null = null;
  /** How dim the glow is (0–1), and where it's heading: dimmed while a passage is focused. */
  #dim = 0;
  #dimTarget = 0;
  #cancelDim: (() => void) | null = null;
  #cancelGrowth: (() => void) | null = null;
  #focusChangedAt = -Infinity;
  /** A change of filter under way, until it lands (see `setLinks`). */
  #morph: ArcMorph | null = null;
  #cancelMorph: (() => void) | null = null;
  /** The reader's latest input came from the keyboard: what it changes shows at once. */
  #keyboard = false;
  /** Where a finger previews, while it does; drives edge panning. */
  #touchPreview: GesturePoint | null = null;
  #edgePanFrame: number | null = null;
  #edgePanTime: number | null = null;
  #linksOfRange: (range: VerseIndexRange) => ArcInstances | null = () => null;
  /** The intro that grows the first links from their sources; runs once, when they arrive. */
  #intro: 'pending' | 'running' | 'done' = 'pending';
  #cancelIntro: (() => void) | null = null;
  /** Hidden (another view is shown), it draws nothing; the intro waits until it's shown. */
  #active = true;
  #hasLinks = false;
  /** Stops answering where passages are (see `locate`). */
  readonly #withdrawLocator: () => void;
  /** Books brushed on the minimap: lit up in the focused passage's place (see `setBrush`). */
  #brush: VerseIndexRange | null = null;
  #viewListener: ((view: AxisView, layout: ArcLayout) => void) | null = null;
  /** A chain of links drawn as light (see `playPath`), and the verse it starts from. */
  readonly #path: PathLayer<ArcPathHop>;
  #pathOrigin: VerseIndex | null = null;

  constructor(options: ArcsControllerOptions) {
    this.#options = options;
    this.#scene = new ArcScene(options.glCanvas);
    const overlay = options.overlayCanvas.getContext('2d');
    if (!overlay) {
      throw new Error('Canvas 2D is not available.');
    }
    this.#overlay = overlay;
    this.#path = PathLayer.over(options.overlayCanvas, ARC_PATH_TRACE);
    this.#view = fullView(options.versification.verseCount);
    this.#names = options.names;
    this.#genreNames = options.genreNames;
    this.#scheduler = new FrameScheduler(() => {
      this.#draw();
    });
    this.#detachGestures = attachGestures(options.container, {
      onGrab: () => {
        this.#pressed = true;
        this.#stopMotion();
      },
      onRelease: (velocity) => {
        this.#pressed = false;
        this.#release(velocity);
      },
      onPan: (dx, dy) => {
        this.#interrupt();
        this.#panByPixels(this.#layout.orientation === 'horizontal' ? dx : dy, this.#pressed);
      },
      onZoom: (factor, center, input) => {
        if (input === 'wheel') {
          this.#wheel(factor, center);
        } else {
          this.#interrupt();
          this.#zoomAt(factor, center);
        }
      },
      onHover: (point, input) => {
        this.#preview(point, input);
      },
      onLeave: () => {
        this.#endPreview();
      },
      previewsAt: (point) => this.#isOnAxisStrip(point),
      onTap: (point) => {
        const passage = this.#passageAt(point);
        if (passage) {
          options.onSelect(passage);
        }
      },
      onDoubleTap: (point) => {
        const anchor = alongToVerse(this.#layout, this.#view, alongOfPoint(this.#layout, point));
        this.#fly(zoomView(this.#view, DOUBLE_TAP_ZOOM, anchor, this.#total), 'flight');
      },
    });
    options.container.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keydown', this.#onAnyKey, { capture: true });
    window.addEventListener('pointerdown', this.#onAnyPointer, { capture: true });
    this.#withdrawLocator = provideLocator(options.container, (passage) => this.locate(passage));
  }

  setSize(width: number, height: number): void {
    this.#layout = computeArcLayout(width, height);
    this.#scene.setSize(width, height);
    this.#scene.setLayout(this.#layout);
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    const canvas = this.#options.overlayCanvas;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    this.#overlay.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.#path.setSize(width, height);
    this.#scheduler.request();
  }

  /**
   * All links to draw as the glowing background, as a change from the ones drawn so far: links
   * leaving the filter sink into the axis and those joining rise out of it. The very first ones
   * grow in instead (see `#playIntro`); with reduced motion, a change only crossfades; from the
   * keyboard, it shows at once.
   */
  setLinks(links: ArcMorph): void {
    this.#settleMorph();
    this.#hasLinks = links.after > 0;
    const morphs =
      this.#intro === 'done' &&
      this.#active &&
      !this.#keyboard &&
      links.before > 0 &&
      morphChanges(links);
    if (!morphs) {
      this.#scene.setLinks(settleArcMorph(links), glowCeiling(links.after));
      if (this.#intro === 'pending' && this.#hasLinks && this.#active) {
        this.#playIntro();
      }
      this.#scheduler.request();
      return;
    }
    // One buffer holds both filters' links; the shader moves them, so no frame rebuilds it.
    const rise = !prefersReducedMotion();
    const from = glowCeiling(links.before);
    const to = glowCeiling(links.after);
    this.#morph = links;
    this.#scene.setLinks(links.instances, from, links.states);
    this.#scene.setMorph(0, rise);
    this.#cancelMorph = animate(MORPH_MS, (progress) => {
      this.#scene.setMorph(progress, rise);
      this.#scene.setCeiling(from * (to / from) ** progress);
      this.#scheduler.request();
      if (progress >= 1) {
        this.#settleMorph();
      }
    });
  }

  /** How to find the (filtered) links of a verse range, for focus and hover highlights. */
  setLinkResolver(resolver: (range: VerseIndexRange) => ArcInstances | null): void {
    this.#linksOfRange = resolver;
    // Lit books bring their own links (see `setBrush`): the passage's wait under them.
    if (!this.#brush) {
      this.#scene.setFocus(this.#focus && resolver(this.#focus));
    }
    this.#scene.setHover(this.#hover && resolver(this.#hover));
    this.#scheduler.request();
  }

  /**
   * Focuses a passage: the background dims, the camera flies to it if it's out of sight, and its
   * links grow out of it as the camera arrives (see `#ignite`).
   */
  setFocus(range: VerseIndexRange | null): void {
    const changed = range?.start !== this.#focus?.start || range?.end !== this.#focus?.end;
    const origin = this.#pathOrigin;
    if (changed && origin !== null && !(range && origin >= range.start && origin <= range.end)) {
      this.clearPath();
    }
    this.#focus = range;
    this.#scene.setFocus(range && this.#linksOfRange(range));
    this.#fadeDim(range === null ? 0 : 1);
    if (range && changed) {
      const arrival = this.#fly(
        revealRange(this.#view, range.start, range.end + 1, this.#total),
        'flight',
      );
      this.#ignite(range, arrival);
    } else if (!range) {
      this.#cancelGrowth?.();
      this.#cancelGrowth = null;
    }
    this.#scheduler.request();
  }

  /** Shows one link and the whole passage it points to, over the focus (which stays as is). */
  setPreview(preview: ArcPreview | null): void {
    this.#linkPreview = preview;
    this.#scene.setPreview(preview?.links ?? null);
    this.#scheduler.request();
  }

  resetView(): void {
    this.#fly(fullView(this.#total), 'flight');
  }

  /**
   * Flies the camera to `target` along the smooth zoom-and-pan path (see `planFlight`), timed by
   * how far it looks and eased in and out. Resolves `true` once it lands, or `false` if the
   * reader took over first. With reduced motion it cuts straight there.
   */
  flyTo(target: AxisView): Promise<boolean> {
    return new Promise((resolve) => {
      this.#fly(target, 'flight', resolve);
    });
  }

  // The minimap (see `Minimap.tsx`): it follows the window, moves it, and brushes books.

  /**
   * Called with the window as shown and the layout, each time the diagram is drawn: the minimap
   * draws its window in the same frame, so the two agree through flights, glides and pulls past an
   * end alike.
   */
  setViewListener(listener: ((view: AxisView, layout: ArcLayout) => void) | null): void {
    this.#viewListener = listener;
    this.#scheduler.request();
  }

  /**
   * Takes hold of the window for a drag on the minimap: whatever moves on its own stops where it
   * is, as under a finger on the stage. Returns the window, at rest.
   */
  grabView(): AxisView {
    this.#interrupt();
    return this.#view;
  }

  /** Puts the window at `view` at once: a drag on the minimap moves it directly, with no easing. */
  showView(view: AxisView): void {
    this.#stopMotion();
    this.#view = clampView(view, this.#total);
    this.#overscroll = 0;
    this.#scheduler.request();
  }

  /** A key's step from the minimap, chained and timed like the stage's own keys. */
  stepView(next: (from: AxisView) => AxisView): void {
    this.#step(next);
  }

  /**
   * Lights up `links`, those of books brushed on the minimap, as a focused passage's are: grown
   * out of the books over the dimmed glow, though the camera stays where it is. They stand in for
   * the focused passage's links until cleared (`null`), and then those show again at once.
   */
  setBrush(range: VerseIndexRange | null, links: ArcInstances | null): void {
    const before = this.#brush;
    this.#brush = range;
    if (!range && !before) {
      return;
    }
    this.#scene.setFocus(range ? links : this.#focus && this.#linksOfRange(this.#focus));
    this.#fadeDim(range === null && this.#focus === null ? 0 : 1);
    if (range && (range.start !== before?.start || range.end !== before.end)) {
      this.#ignite(range, 0);
    } else if (!range) {
      this.#cancelGrowth?.();
      this.#cancelGrowth = null;
      this.#scene.setFocusGrowth(1, this.#focus);
      this.#scene.setFocusFade(1);
    }
    this.#scheduler.request();
  }

  /**
   * Draws a chain of cross-references as light travelling it hop by hop along the links' own arcs,
   * one hop every `HOP_MS` (250ms), each landing with a flash: the loading screen's light. Build
   * the chain with `buildArcPath` from `findConnectionPath`'s steps. It takes the place of any path
   * drawn before, and once every hop has landed the whole chain stays drawn, quietly, until another
   * path is played, `clearPath` is called, `signal` aborts, or the focus moves to a passage without
   * the chain's first verse. The camera stays where it is: fly it there first if need be.
   *
   * Resolves `true` once the last hop has landed and its flash has faded, `false` if it was cut
   * short (any of the above, or the controller disposed). `onLit` is told which steps the light is
   * at as it reaches each one, and `null` once it has passed them all or stopped. With reduced
   * motion the whole chain is drawn at once and every step lit together, for as long as the light
   * would have taken; out of sight (see `setActive`), it is drawn at once and resolves at once.
   */
  playPath(path: ArcPath, options: PathPlayOptions = {}): Promise<boolean> {
    this.#pathOrigin = path.origin;
    return this.#path.play(path.hops, pathMode(this.#active), options);
  }

  /** Takes the path off the diagram; one still travelling stops at once (see `playPath`). */
  clearPath(): void {
    this.#pathOrigin = null;
    this.#path.clear();
  }

  /**
   * For the guided tour (`tour/`), which frames each stop itself: focuses `range` as `setFocus`
   * does, but flies to `view` rather than only bringing the passage into sight. Its links grow out
   * of it as the camera lands — whatever key the reader pressed last, since it is the tour that
   * moves them. Resolves `true` once landed, or `false` if the reader took over first.
   */
  showStop(range: VerseIndexRange, view: AxisView): Promise<boolean> {
    const changed = range.start !== this.#focus?.start || range.end !== this.#focus.end;
    // As with `setFocus`: a path stays only while its first verse is in focus.
    const origin = this.#pathOrigin;
    if (changed && origin !== null && !(origin >= range.start && origin <= range.end)) {
      this.clearPath();
    }
    this.#keyboard = false;
    this.#focus = range;
    this.#scene.setFocus(this.#linksOfRange(range));
    this.#fadeDim(1);
    return new Promise((resolve) => {
      const arrival = this.#fly(view, 'flight', resolve);
      if (changed) {
        this.#ignite(range, arrival);
      }
      this.#scheduler.request();
    });
  }

  dispose(): void {
    this.#withdrawLocator();
    this.#stopMotion();
    this.#cancelDim?.();
    this.#cancelGrowth?.();
    this.#cancelMorph?.();
    this.#cancelIntro?.();
    this.#stopEdgePan();
    this.#scheduler.dispose();
    this.#detachGestures();
    this.#path.dispose();
    this.#options.container.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keydown', this.#onAnyKey, { capture: true });
    window.removeEventListener('pointerdown', this.#onAnyPointer, { capture: true });
    this.#scene.dispose();
  }

  /**
   * Every arc grows from its source verse to its target while the glow fades in: the whole Bible's
   * connections unfold at once, continuing the loading screen's arcs of light. Skipped for readers
   * who prefer reduced motion.
   */
  #playIntro(): void {
    if (prefersReducedMotion()) {
      this.#intro = 'done';
      return;
    }
    this.#intro = 'running';
    this.#scene.setReveal(0);
    this.#cancelIntro = animate(INTRO_MS, (progress) => {
      this.#scene.setReveal(progress);
      if (progress >= 1) {
        this.#intro = 'done';
        this.#cancelIntro = null;
      }
      this.#scheduler.request();
    });
  }

  /** The axis is lettered, so a change of language repaints it. */
  setNames(names: BookNames, genreNames: Readonly<Record<GenreId, string>>): void {
    this.#names = names;
    this.#genreNames = genreNames;
    this.#draw();
  }

  /**
   * Shown or hidden; drawing resumes (and the intro starts) when it's shown. Hidden, whatever was
   * moving lands where it was going, so nothing animates out of sight.
   */
  setActive(active: boolean): void {
    this.#active = active;
    if (active) {
      if (this.#intro === 'pending' && this.#hasLinks) {
        this.#playIntro();
      }
      this.#scheduler.request();
    } else {
      this.#finishMotion();
    }
  }

  /**
   * The diagram as it is, the axis over the arcs, handed to `compose` for a picture. It draws and
   * hands over in one go: a WebGL canvas keeps its pixels only until the frame it was drawn in ends.
   */
  snapshot<T>(compose: (layers: readonly HTMLCanvasElement[]) => T): T {
    this.#draw();
    return compose([this.#options.glCanvas, this.#options.overlayCanvas, this.#path.canvas]);
  }

  /**
   * Where `passage` is on the axis at the current zoom, for the passage beacon: the middle of its
   * stretch of the axis line, in viewport pixels, with the axis's span as the part in sight. Out
   * of sight, it lies past the end of the axis on its side. Read-only.
   */
  locate(passage: Passage): PassageSpot | null {
    const layout = this.#layout;
    if (layout.width === 0 || layout.height === 0) {
      return null;
    }
    const range = this.#rangeOf(passage);
    const along = verseToAlong(layout, this.#shownView(), (range.start + range.end + 1) / 2);
    const stage = this.#options.container.getBoundingClientRect();
    const seen = this.#options.visibleBox?.();
    const inSight = (box: ScreenBox) => (seen ? clipBox(box, seen) : box);
    return layout.orientation === 'horizontal'
      ? {
          point: { x: stage.left + along, y: stage.top + layout.baseline },
          bounds: inSight({
            left: stage.left + layout.axisStart,
            top: stage.top,
            right: stage.left + layout.axisEnd,
            bottom: stage.bottom,
          }),
        }
      : {
          point: { x: stage.left + layout.baseline, y: stage.top + along },
          bounds: inSight({
            left: stage.left,
            top: stage.top + layout.axisStart,
            right: stage.right,
            bottom: stage.top + layout.axisEnd,
          }),
        };
  }

  /**
   * Where a passage's middle will be on the stage once the camera is at rest, in the stage's own
   * pixels: where it lands from a flight under way, or where it is now. For a host that slides
   * the stage to keep the passage in sight (see `slideToShow`).
   */
  restingPoint(passage: Passage): { readonly x: number; readonly y: number } | null {
    const layout = this.#layout;
    if (layout.width === 0 || layout.height === 0) {
      return null;
    }
    const range = this.#rangeOf(passage);
    const view = this.#motion?.target ?? this.#view;
    const along = verseToAlong(layout, view, (range.start + range.end + 1) / 2);
    return layout.orientation === 'horizontal'
      ? { x: along, y: layout.baseline }
      : { x: layout.baseline, y: along };
  }

  get #total(): number {
    return this.#options.versification.verseCount;
  }

  #draw(): void {
    if (!this.#active || this.#layout.width === 0 || this.#layout.height === 0) {
      return;
    }
    const view = this.#shownView();
    const layout = this.#layout;
    this.#scene.setView(view);
    this.#scene.render();
    this.#path.setCurves((hop) => arcPathCurve(layout, view, hop));
    paintAxis(this.#overlay, {
      layout: this.#layout,
      view,
      versification: this.#options.versification,
      names: this.#names,
      genreNames: this.#genreNames,
      focus: this.#focus,
      hover: this.#hover,
      passage: this.#linkPreview?.passage ?? null,
      brush: this.#brush,
    });
    this.#viewListener?.(view, this.#layout);
  }

  /** The window as shown: the one at rest, shifted by however far a drag pulls past an end. */
  #shownView(): AxisView {
    if (this.#overscroll === 0) {
      return this.#view;
    }
    const length = this.#layout.axisEnd - this.#layout.axisStart;
    const shift = rubberBand(this.#overscroll, length) / pixelsPerVerse(this.#layout, this.#view);
    return { start: this.#view.start + shift, end: this.#view.end + shift };
  }

  #verseAt(point: GesturePoint): number | null {
    const along = alongOfPoint(this.#layout, point);
    if (along < this.#layout.axisStart || along > this.#layout.axisEnd) {
      return null;
    }
    const verse = Math.floor(alongToVerse(this.#layout, this.#shownView(), along));
    return Math.min(Math.max(verse, 0), this.#total - 1);
  }

  #passageAt(point: GesturePoint): Passage | null {
    const verse = this.#verseAt(point);
    if (verse === null) {
      return null;
    }
    return pixelsPerVerse(this.#layout, this.#view) < VERSE_PICK_PIXELS
      ? chapterPassageOf(verse, this.#options.versification)
      : versePassage(verse);
  }

  #preview(point: GesturePoint, input: PreviewInput): void {
    this.#hoverAt(point, input);
    if (input === 'touch') {
      this.#touchPreview = point;
      this.#updateEdgePan();
    }
  }

  #endPreview(): void {
    this.#touchPreview = null;
    this.#stopEdgePan();
    this.#setHover(null);
    this.#options.onHover(null);
  }

  #hoverAt(point: GesturePoint, input: PreviewInput): void {
    // A finger past an end of the axis keeps previewing its first or last passage.
    const passage = this.#passageAt(input === 'touch' ? this.#clampToAxis(point) : point);
    this.#setHover(passage && this.#rangeOf(passage));
    this.#options.onHover(passage ? { passage, x: point.x, y: point.y, input } : null);
  }

  #clampToAxis(point: GesturePoint): GesturePoint {
    const { orientation, axisStart, axisEnd } = this.#layout;
    const clamp = (along: number) => Math.min(Math.max(along, axisStart), axisEnd - 0.5);
    return orientation === 'horizontal'
      ? { x: clamp(point.x), y: point.y }
      : { x: point.x, y: clamp(point.y) };
  }

  /** The axis line and its labels: below it when horizontal, left of it when vertical. */
  #isOnAxisStrip(point: GesturePoint): boolean {
    const { orientation, baseline } = this.#layout;
    return orientation === 'horizontal'
      ? point.y >= baseline - AXIS_STRIP_REACH_PX
      : point.x <= baseline + AXIS_STRIP_REACH_PX;
  }

  /** Signed edge-panning speed for a finger at `point`: positive pans toward later verses. */
  #edgePanSpeed(point: GesturePoint): number {
    const { axisStart, axisEnd } = this.#layout;
    const along = alongOfPoint(this.#layout, point);
    const depth = (distanceInside: number) =>
      Math.min(Math.max(1 - distanceInside / EDGE_PAN_ZONE_PX, 0), 1) ** 2;
    return EDGE_PAN_MAX_SPEED * (depth(axisEnd - along) - depth(along - axisStart));
  }

  #updateEdgePan(): void {
    const point = this.#touchPreview;
    if (point && this.#edgePanFrame === null && this.#edgePanSpeed(point) !== 0) {
      this.#edgePanFrame = requestAnimationFrame(this.#edgePanStep);
    }
  }

  readonly #edgePanStep = (time: number): void => {
    this.#edgePanFrame = null;
    const point = this.#touchPreview;
    const speed = point ? this.#edgePanSpeed(point) : 0;
    if (!point || speed === 0) {
      this.#edgePanTime = null;
      return;
    }
    const last = this.#edgePanTime ?? time;
    const before = this.#view;
    // Capped, so a stalled frame never jumps the view.
    this.#panByPixels((-speed * Math.min(time - last, 50)) / 1000, false);
    this.#hoverAt(point, 'touch');
    if (time !== last && this.#view.start === before.start) {
      this.#edgePanTime = null; // Reached the end of the Bible: nothing left to pan to.
      return;
    }
    this.#edgePanTime = time;
    this.#edgePanFrame = requestAnimationFrame(this.#edgePanStep);
  };

  #stopEdgePan(): void {
    if (this.#edgePanFrame !== null) {
      cancelAnimationFrame(this.#edgePanFrame);
    }
    this.#edgePanFrame = null;
    this.#edgePanTime = null;
  }

  #setHover(range: VerseIndexRange | null): void {
    if (range?.start === this.#hover?.start && range?.end === this.#hover?.end) {
      return;
    }
    this.#hover = range;
    this.#scene.setHover(range && this.#linksOfRange(range));
    this.#scheduler.request();
  }

  #rangeOf(passage: Passage): VerseIndexRange {
    if (passage.kind === 'verse') {
      return { start: passage.verse, end: passage.verse };
    }
    const range = this.#options.versification.chapterRange(passage.book, passage.chapter);
    return range ?? { start: 0, end: 0 };
  }

  /**
   * Moves the window's start to `position` px along the axis (at the current zoom). Past an end it
   * stops there, unless `elastic`: then the rest is kept as overscroll, for a drag to pull on.
   */
  #placeAt(position: number, elastic: boolean): void {
    const pixels = pixelsPerVerse(this.#layout, this.#view);
    const span = this.#view.end - this.#view.start;
    const last = Math.max(this.#total - span, 0) * pixels;
    const start = Math.min(Math.max(position, 0), last);
    this.#view = { start: start / pixels, end: start / pixels + span };
    this.#overscroll = elastic ? position - start : 0;
    this.#scheduler.request();
  }

  /** A finger's drag pulls past the ends (`elastic`), with resistance; anything else stops there. */
  #panByPixels(deltaAlong: number, elastic: boolean): void {
    const stretch = elastic && !prefersReducedMotion();
    const length = this.#layout.axisEnd - this.#layout.axisStart;
    // From where the window shows, so letting go of the band never jumps.
    const overscroll = stretch ? this.#overscroll : rubberBand(this.#overscroll, length);
    const start = this.#view.start * pixelsPerVerse(this.#layout, this.#view);
    this.#placeAt(start + overscroll - deltaAlong, stretch);
  }

  #zoomAt(factor: number, point: GesturePoint): void {
    const anchor = alongToVerse(this.#layout, this.#view, alongOfPoint(this.#layout, point));
    this.#view = zoomView(this.#view, factor, anchor, this.#total);
    this.#scheduler.request();
  }

  /**
   * A released drag: flicked, it coasts and slows down; pulled past an end, it springs back,
   * settling without bouncing past it. With reduced motion it stays where it was let go.
   */
  #release(velocity: GestureVelocity): void {
    const along = this.#layout.orientation === 'horizontal' ? velocity.x : velocity.y;
    // The window moves against the finger.
    let speed = Math.abs(along) >= MIN_FLICK_SPEED ? -along : 0;
    if ((speed === 0 && this.#overscroll === 0) || prefersReducedMotion()) {
      return;
    }
    this.#stopMotion();
    const cancel = simulate((elapsed) => {
      const pixels = pixelsPerVerse(this.#layout, this.#view);
      const last = Math.max(this.#total - (this.#view.end - this.#view.start), 0) * pixels;
      const glide = stepGlide(
        { position: this.#view.start * pixels + this.#overscroll, velocity: speed },
        elapsed,
        0,
        last,
      );
      speed = glide.velocity;
      const resting = isAtRest(glide, 0, last);
      this.#placeAt(glide.position, !resting);
      if (resting) {
        this.#motion = null;
      }
      return !resting;
    });
    this.#motion = { kind: 'glide', target: null, cancel };
  }

  /** The wheel zooms in notches; they're smoothed into one glide that settles where they add up. */
  #wheel(factor: number, point: GesturePoint): void {
    this.#wheelAnchor = point;
    if (prefersReducedMotion()) {
      this.#interrupt();
      this.#zoomAt(factor, point);
      return;
    }
    if (this.#motion?.kind === 'wheel') {
      this.#wheelZoom += Math.log(factor);
      return;
    }
    this.#interrupt();
    this.#wheelZoom = Math.log(factor);
    const cancel = simulate((elapsed) => {
      const step = this.#wheelZoom * (1 - Math.exp(-elapsed / WHEEL_TIME_CONSTANT_MS));
      this.#wheelZoom -= step;
      this.#zoomAt(Math.exp(step), this.#wheelAnchor);
      const span = this.#view.end - this.#view.start;
      const atLimit =
        (this.#wheelZoom > 0 && span <= MIN_VIEW_SPAN) ||
        (this.#wheelZoom < 0 && span >= this.#total);
      const done = atLimit || Math.abs(this.#wheelZoom) < WHEEL_REST;
      if (done) {
        this.#zoomAt(Math.exp(this.#wheelZoom), this.#wheelAnchor);
        this.#wheelZoom = 0;
        this.#motion = null;
      }
      return !done;
    });
    this.#motion = { kind: 'wheel', target: null, cancel };
  }

  /**
   * Moves the camera to `target`: a flight along the smooth zoom-and-pan path, timed by how far it
   * looks; or a key's step, short and fixed. Any pull past an end eases away on the way. With
   * reduced motion, or out of sight, it cuts straight there. Returns how long it takes, in ms.
   */
  #fly(target: AxisView, kind: 'flight' | 'step', onEnd?: (landed: boolean) => void): number {
    this.#stopMotion();
    const destination = clampView(target, this.#total);
    const from = this.#view;
    const overscroll = this.#overscroll;
    const still = prefersReducedMotion() || !this.#active;
    if (still || (sameView(from, destination) && overscroll === 0)) {
      this.#view = destination;
      this.#overscroll = 0;
      this.#scheduler.request();
      onEnd?.(true);
      return 0;
    }
    const flight = planFlight(from, destination);
    const duration = kind === 'step' ? KEY_STEP_MS : flightDuration(flight.length);
    const cancel = animate(
      duration,
      (progress) => {
        this.#view = clampView(flight.at(progress), this.#total);
        this.#overscroll = overscroll * (1 - progress);
        this.#scheduler.request();
        if (progress >= 1) {
          this.#motion = null;
          onEnd?.(true);
        }
      },
      kind === 'step' ? easeOutCubic : easeInOutCubic,
    );
    this.#motion = {
      kind,
      target: destination,
      cancel: () => {
        cancel();
        onEnd?.(false);
      },
    };
    return duration;
  }

  /** A key's step, from where the last one lands if it's still under way. */
  #step(next: (from: AxisView) => AxisView): void {
    const motion = this.#motion;
    const from = motion?.kind === 'step' && motion.target ? motion.target : this.#view;
    this.#fly(next(from), 'step');
  }

  #stopMotion(): void {
    const motion = this.#motion;
    this.#motion = null;
    motion?.cancel();
  }

  /**
   * Input other than a held finger stops whatever moves, and lets go of any pull past an end
   * where it shows.
   */
  #interrupt(): void {
    this.#stopMotion();
    if (this.#overscroll !== 0 && !this.#pressed) {
      this.#panByPixels(0, false);
    }
  }

  /** Lands whatever is moving where it was going, at once. */
  #finishMotion(): void {
    const target = this.#motion?.target ?? null;
    this.#stopMotion();
    if (target) {
      this.#view = target;
    }
    this.#overscroll = 0;
    this.#cancelGrowth?.();
    this.#cancelGrowth = null;
    this.#scene.setFocusGrowth(1, this.#focus);
    this.#scene.setFocusFade(1);
    this.#cancelDim?.();
    this.#cancelDim = null;
    this.#dim = this.#dimTarget;
    this.#scene.setDim(this.#dim);
    this.#settleMorph();
    this.#path.finish();
  }

  /** Dims the glow (1) or brightens it back (0), over `DIM_MS`. */
  #fadeDim(target: number): void {
    if (target === this.#dimTarget) {
      return;
    }
    this.#dimTarget = target;
    this.#cancelDim?.();
    this.#cancelDim = null;
    if (!this.#active) {
      this.#dim = target;
      this.#scene.setDim(target);
      return;
    }
    const from = this.#dim;
    this.#cancelDim = animate(DIM_MS, (progress) => {
      this.#dim = from + (target - from) * progress;
      this.#scene.setDim(this.#dim);
      this.#scheduler.request();
    });
  }

  /**
   * Lights up a newly focused passage: its links grow out of it, finishing as the camera lands
   * (`arrivalMs` from now). They show at once when the reader focuses passages in quick
   * succession or from the keyboard, and fade in instead with reduced motion.
   */
  #ignite(range: VerseIndexRange, arrivalMs: number): void {
    this.#cancelGrowth?.();
    this.#cancelGrowth = null;
    const now = performance.now();
    const hurried = now - this.#focusChangedAt < FOCUS_GROW_MS;
    this.#focusChangedAt = now;
    this.#scene.setFocusGrowth(1, range);
    this.#scene.setFocusFade(1);
    if (hurried || this.#keyboard || !this.#active) {
      return;
    }
    if (prefersReducedMotion()) {
      this.#scene.setFocusFade(0);
      this.#cancelGrowth = animate(FOCUS_FADE_MS, (progress) => {
        this.#scene.setFocusFade(progress);
        this.#scheduler.request();
      });
      return;
    }
    // Timed by the clock, like the flight it lands with, however slowly frames come.
    const delay = Math.max(arrivalMs - FOCUS_GROW_MS, 0);
    const total = delay + FOCUS_GROW_MS;
    this.#scene.setFocusGrowth(0, range);
    this.#cancelGrowth = animate(
      total,
      (share) => {
        const linear = Math.min(Math.max((share * total - delay) / FOCUS_GROW_MS, 0), 1);
        this.#scene.setFocusGrowth(easeOutCubic(linear), range);
        this.#scheduler.request();
      },
      (linear) => linear,
    );
  }

  /** Ends a change of filter where it lands, keeping only the links it lands on. */
  #settleMorph(): void {
    const morph = this.#morph;
    if (!morph) {
      return;
    }
    this.#morph = null;
    this.#cancelMorph?.();
    this.#cancelMorph = null;
    this.#scene.setLinks(settleArcMorph(morph), glowCeiling(morph.after));
    this.#scene.setMorph(1);
    this.#scheduler.request();
  }

  readonly #onAnyKey = (event: KeyboardEvent): void => {
    if (!MODIFIER_KEYS.has(event.key)) {
      this.#keyboard = true;
    }
  };

  readonly #onAnyPointer = (): void => {
    this.#keyboard = false;
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const total = this.#total;
    const span = (view: AxisView) => view.end - view.start;
    const center = (view: AxisView) => (view.start + view.end) / 2;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.#step((view) => panView(view, -span(view) * KEYBOARD_PAN_SHARE, total));
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.#step((view) => panView(view, span(view) * KEYBOARD_PAN_SHARE, total));
        break;
      case '+':
      case '=':
        this.#step((view) => zoomView(view, KEYBOARD_ZOOM, center(view), total));
        break;
      case '-':
      case '_':
        this.#step((view) => zoomView(view, 1 / KEYBOARD_ZOOM, center(view), total));
        break;
      case '0':
        this.resetView();
        break;
      case 'Escape':
        this.#options.onClear();
        break;
      default:
        return;
    }
    event.preventDefault();
  };
}
