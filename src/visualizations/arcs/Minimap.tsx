import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { VerseIndexRange, Versification } from '../../core/bible/versification.ts';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { MAX_PIXEL_RATIO } from '../shared/frames.ts';
import { useElementSize, type ElementSize } from '../shared/use-element-size.ts';
import type { ArcLayout, Orientation } from './arc-layout.ts';
import type { ArcsController } from './arcs-controller.ts';
import { paintMinimap } from './axis-painter.ts';
import { fullView, type AxisView } from './axis-view.ts';
import {
  booksInView,
  bookSpan,
  describeView,
  dragView,
  grabAt,
  minimapKeyAction,
  MOUSE_REACH,
  tapBrush,
  TOUCH_REACH,
  trackToVerse,
  type MinimapPress,
  type MinimapTrack,
} from './minimap-strip.ts';
import styles from './ArcsStage.module.css';

/** What the diagram calls each time it draws: the window as shown, and where the axis lies. */
export type ViewListener = (view: AxisView, layout: ArcLayout) => void;

interface MinimapProps {
  readonly controllerRef: RefObject<ArcsController | null>;
  /** Filled with what the diagram should call as it draws, so the strip follows in that frame. */
  readonly viewListenerRef: RefObject<ViewListener | null>;
  readonly versification: Versification;
  readonly orientation: Orientation;
  /** The books lit up, if any. */
  readonly brush: VerseIndexRange | null;
  readonly onBrush: (brush: VerseIndexRange | null) => void;
}

/** A press that moves no further than this, in px, is a tap. */
const TAP_SLOP_PX = 6;

/** A press being held: what it took hold of, and the pointer holding it. */
interface HeldPress extends MinimapPress {
  readonly pointerId: number;
  /** Where it went down along the strip, in px. */
  readonly along: number;
  moved: boolean;
}

/** All the strip draws from. Kept out of React's state: the window changes every frame. */
interface Strip {
  view: AxisView;
  /** Where the axis lies, once the diagram has drawn. */
  track: MinimapTrack | null;
  size: ElementSize;
  orientation: Orientation;
  brush: VerseIndexRange | null;
  /** The books under a brush still being dragged. */
  pending: VerseIndexRange | null;
  /** Names the window for `aria-valuetext`, and the name it was last given. */
  describe: (view: AxisView) => string;
  described: string;
}

/**
 * A strip of the whole Bible beside the axis, with a window over the part in view. Drag the window
 * to move along the Bible and its edges to zoom: the diagram follows directly. Drag across books
 * elsewhere to light up their cross-references; tap the lit books, or press Escape, to clear them.
 * Keyboard: the arrows move the window, + and − zoom it, Enter lights up the books in view.
 */
export function Minimap({
  controllerRef,
  viewListenerRef,
  versification,
  orientation,
  brush,
  onBrush,
}: MinimapProps) {
  const { t, books } = useLocalization();
  const total = versification.verseCount;
  const helpId = useId();
  const elementRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(elementRef);
  const press = useRef<HeldPress | null>(null);
  const strip = useRef<Strip>({
    view: fullView(total),
    track: null,
    size: { width: 0, height: 0 },
    orientation,
    brush,
    pending: null,
    describe: () => '',
    described: '',
  });

  const draw = useCallback(() => {
    const element = elementRef.current;
    const context = canvasRef.current?.getContext('2d');
    const {
      view,
      track,
      size: { width, height },
    } = strip.current;
    if (!element || !context || !track || width === 0 || height === 0) {
      return;
    }
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintMinimap(context, {
      orientation: strip.current.orientation,
      width,
      height,
      track,
      view,
      versification,
      brush: strip.current.pending ?? strip.current.brush,
    });
    // Where the window is, as shares of the canon: what the strip shows, for whatever reads the
    // page rather than its pixels.
    element.dataset['start'] = String(view.start / total);
    element.dataset['end'] = String(view.end / total);
    // Named only when the name changes, so a screen reader isn't handed a new value every frame.
    const described = strip.current.describe(view);
    if (described !== strip.current.described) {
      strip.current.described = described;
      element.setAttribute('aria-valuetext', described);
      const middle = (view.start + view.end) / 2 / total;
      element.setAttribute('aria-valuenow', String(Math.round(middle * 100)));
    }
  }, [versification, total]);

  useEffect(() => {
    viewListenerRef.current = (view, layout) => {
      strip.current.view = view;
      strip.current.track = { start: layout.axisStart, end: layout.axisEnd };
      draw();
    };
    return () => {
      viewListenerRef.current = null;
    };
  }, [viewListenerRef, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    strip.current.size = size;
    draw();
  }, [size, draw]);

  useEffect(() => {
    strip.current.orientation = orientation;
    strip.current.brush = brush;
    strip.current.describe = (view) =>
      t('arcs.minimap.inView')(describeView(view, versification, books));
    draw();
  }, [orientation, brush, t, books, versification, draw]);

  const alongOf = (event: PointerEvent<HTMLElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return orientation === 'horizontal' ? event.clientX - rect.left : event.clientY - rect.top;
  };

  /** Lets go of the press, and of any brush it was dragging. */
  const release = (element: HTMLElement) => {
    press.current = null;
    strip.current.pending = null;
    delete element.dataset['pressed'];
    draw();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { track, view } = strip.current;
    if (!track || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const along = alongOf(event);
    const reach = event.pointerType === 'mouse' ? MOUSE_REACH : TOUCH_REACH;
    const grab = grabAt(track, total, view, along, reach);
    press.current = {
      grab,
      // Taking hold of the window stops a flight or a glide where it is, as a finger does.
      view: grab === 'brush' ? view : (controllerRef.current?.grabView() ?? view),
      verse: trackToVerse(track, total, along),
      pointerId: event.pointerId,
      along,
      moved: false,
    };
    event.currentTarget.dataset['grab'] = grab;
    event.currentTarget.dataset['pressed'] = '';
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const { track, view } = strip.current;
    const current = press.current;
    if (!track) {
      return;
    }
    const along = alongOf(event);
    if (!current) {
      // What a press here would take hold of, for the pointer's cursor.
      event.currentTarget.dataset['grab'] = grabAt(track, total, view, along, MOUSE_REACH);
      return;
    }
    if (event.pointerId !== current.pointerId) {
      return;
    }
    if (!current.moved && Math.abs(along - current.along) <= TAP_SLOP_PX) {
      return;
    }
    current.moved = true;
    const verse = trackToVerse(track, total, along);
    if (current.grab === 'brush') {
      strip.current.pending = bookSpan(versification, current.verse, verse);
      draw();
    } else {
      controllerRef.current?.showView(dragView(current, verse, total));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    const { pending } = strip.current;
    release(event.currentTarget);
    if (current.moved) {
      if (pending) {
        onBrush(pending);
      }
      return;
    }
    // A tap on the lit books clears them; one on other books, outside the window, lights them up.
    const tapped = tapBrush(versification, brush, current.verse);
    if (current.grab === 'brush' || (current.grab === 'window' && tapped === null)) {
      onBrush(tapped);
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (press.current?.pointerId === event.pointerId) {
      release(event.currentTarget);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The browser's own shortcuts (Ctrl and + zooms the page) are left to it.
    const action =
      event.altKey || event.ctrlKey || event.metaKey ? null : minimapKeyAction(event.key, total);
    if (!action) {
      return;
    }
    switch (action.kind) {
      case 'view':
        controllerRef.current?.stepView(action.next);
        break;
      case 'light':
        onBrush(booksInView(versification, strip.current.view));
        break;
      case 'clear':
        if (!brush) {
          return;
        }
        onBrush(null);
        break;
    }
    event.preventDefault();
  };

  return (
    <>
      <div
        ref={elementRef}
        className={styles.minimap}
        role="slider"
        tabIndex={0}
        aria-label={t('arcs.minimap')}
        aria-describedby={helpId}
        aria-orientation={orientation}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      </div>
      <p id={helpId} className={styles.visuallyHidden}>
        {t('arcs.minimap.help')}
      </p>
    </>
  );
}
