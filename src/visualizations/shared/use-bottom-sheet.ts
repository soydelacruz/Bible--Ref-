import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { usingKeyboard } from '../../shared/ui/input-modality.ts';

/** Movement after which a touch on the sheet counts as dragging it or scrolling its content. */
const DRAG_SLOP_PX = 4;
/** How far ahead a flick carries the sheet when choosing where it settles: its speed times this. */
const FLICK_PROJECTION_MS = 180;
/** Pulled below its low point by this share of its visible height (or flicked as far), it closes. */
const CLOSE_SHARE = 0.3;
/** How far the sheet stretches, at most, past a point it can't go beyond. */
const STRETCH_PX = 36;
/** Only the last moments of a drag set the speed of its flick. */
const VELOCITY_WINDOW_MS = 100;
/** Clicks right after a drag belong to the drag, not to the button where it ended. */
const CLICKS_AFTER_DRAG_MS = 400;
/** The closing slide's longest wait before the sheet is removed anyway (it takes 500ms). */
const CLOSE_TIMEOUT_MS = 700;
/** Less motion: a sheet let go of below its low point fades where it is, rather than sliding. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

interface Drag {
  readonly startX: number;
  readonly startY: number;
  /** The sheet's offset (px below its top position) when the drag took hold of it. */
  from: number;
  /** The offset of its low (collapsed) point. */
  readonly lowest: number;
  /** The scrollable content under the finger, if any: it scrolls instead, where it can. */
  readonly scroller: HTMLElement | null;
  mode: 'pending' | 'sheet' | 'content';
  offset: number;
  samples: { readonly y: number; readonly time: number }[];
}

/** Rubber-banding, as on iOS: the further past the limit, the harder it pulls back. */
function stretch(distance: number): number {
  return STRETCH_PX * (1 - 1 / ((distance * 0.55) / STRETCH_PX + 1));
}

/** The sheet's current offset, mid-transition included, so a finger can catch it in flight. */
function currentOffset(sheet: HTMLElement): number {
  const { transform } = getComputedStyle(sheet);
  return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
}

/** The nearest vertically scrollable element from `target` up to `sheet`. */
function scrollerOf(target: EventTarget | null, sheet: HTMLElement): HTMLElement | null {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== sheet;
    element = element.parentElement
  ) {
    if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight + 1) {
      const { overflowY } = getComputedStyle(element);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return element;
      }
    }
  }
  return null;
}

/** Whether a panel has something to show: what React would render nothing for, it has not. */
function hasContent(content: ReactNode): boolean {
  return content !== undefined && content !== null && content !== false;
}

/** Whether the element has a transition to run (a test's DOM has none). */
function transitions(element: HTMLElement): boolean {
  return getComputedStyle(element)
    .transitionDuration.split(',')
    .some((duration) => parseFloat(duration) > 0);
}

/** Pixels per ms (positive: down) over the drag's last moments. */
function velocityOf(samples: Drag['samples']): number {
  const last = samples.at(-1);
  const first = samples.find((sample) => last && last.time - sample.time <= VELOCITY_WINDOW_MS);
  return first && last && last.time > first.time
    ? (last.y - first.y) / (last.time - first.time)
    : 0;
}

/**
 * A bottom sheet with two heights, collapsed and expanded, that follows the finger like a native
 * one: it can be dragged by any part, its content scrolls when it should instead (expanded, and
 * not at the top), it settles where a flick carries it, and it closes when pulled down from its
 * low point (if `onClose` is given). Taps on the handle and the scrim toggle it. Without touch, or
 * on wide screens (where `space` isn't displayed), it is a plain panel.
 *
 * Collapsed, it shows its handle and the panel's header (its first `<header>`: the passage's name
 * and the line that counts its links), however tall the language and the name make it. The room
 * kept for it is measured into `--sheet-peek` on the container. Until the panel has a header (it
 * is waiting for its text, or offering to fetch it again), it shows all of what the panel holds.
 * When focus lands below the fold (one of the counts jumping to its section), it opens up to show
 * it.
 *
 * When `content` goes, the sheet keeps showing it while it slides out (or fades, with less
 * motion), and only then is gone: `panel` is what to render in it, and `present` whether to
 * render it at all. Closed from the keyboard, it goes at once.
 *
 * Positions and transitions are CSS, keyed on the container's `data-sheet` ("collapsed" or
 * "expanded"), `data-sheet-dragging`, `data-sheet-closing` and `data-sheet-instant`. While dragged,
 * the sheet and the scrim are moved directly, with no re-renders.
 */
export function useBottomSheet(content: ReactNode, onClose: (() => void) | undefined) {
  const open = hasContent(content);
  // What the sheet shows, kept as it was once it closes, so that it leaves with its content
  // rather than empty.
  const [shown, setShown] = useState<ReactNode>(content);
  if (open && content !== shown) {
    setShown(content);
  }
  const present = open || hasContent(shown);
  const closing = present && !open;
  const [expanded, setExpanded] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Closed from the keyboard, it goes at once. Decided as it renders, so that nothing can read its
  // style (and start its slide) before it is marked.
  const [instant, setInstant] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setInstant(!open && usingKeyboard());
    if (open) {
      setExpanded(false); // A sheet always opens collapsed; one closing keeps its height.
    }
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const isExpanded = useEffectEvent(() => expanded);
  const canClose = useEffectEvent(() => onClose !== undefined);
  const close = useEffectEvent(() => {
    onClose?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    const space = spaceRef.current;
    const scrim = scrimRef.current;
    if (!open || !container || !sheet || !space || !scrim) {
      return undefined;
    }
    let drag: Drag | null = null;
    let clicksBlockedUntil = 0;
    // Let go of below its low point with less motion: it stays where the finger left it, fading.
    let heldWhereLeft = false;

    const moveTo = (offset: number, lowest: number) => {
      sheet.style.transform = `translateY(${String(offset)}px)`;
      scrim.style.opacity = String(Math.min(Math.max(1 - offset / lowest, 0), 1));
    };
    /** Hands the position back to CSS, which animates to the current state's. */
    const letGo = () => {
      delete container.dataset.sheetDragging;
      sheet.style.transform = '';
      scrim.style.opacity = '';
    };
    const settle = (expand: boolean) => {
      flushSync(() => {
        setExpanded(expand);
      });
      letGo();
    };
    /** Closes it from where the finger left it: the slide out carries on from there. */
    const pullAway = () => {
      heldWhereLeft = matchMedia(REDUCED_MOTION).matches;
      if (heldWhereLeft) {
        delete container.dataset.sheetDragging;
        scrim.style.opacity = '';
      } else {
        letGo();
      }
      flushSync(close);
      if (!('sheetClosing' in container.dataset)) {
        heldWhereLeft = false;
        letGo(); // Kept open after all: back to where it was.
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (drag?.mode === 'sheet') {
        return; // Another finger mid-drag: the drag carries on until every finger lifts.
      }
      drag = null;
      const touch = event.touches.item(0);
      const isSheet = space.offsetHeight > 0; // On wide screens it's a side panel.
      if (!touch || event.touches.length > 1 || !isSheet) {
        return;
      }
      drag = {
        startX: touch.clientX,
        startY: touch.clientY,
        from: 0,
        lowest: sheet.offsetHeight - space.offsetHeight,
        scroller: scrollerOf(event.target, sheet),
        mode: 'pending',
        offset: 0,
        samples: [{ y: touch.clientY, time: event.timeStamp }],
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches.item(0);
      if (!drag || !touch || event.touches.length > 1) {
        return;
      }
      if (drag.mode === 'pending') {
        const dx = touch.clientX - drag.startX;
        const dy = touch.clientY - drag.startY;
        if (Math.hypot(dx, dy) < DRAG_SLOP_PX) {
          return;
        }
        // Content scrolls where it can: expanded and moving up, or away from its top. Everything
        // else (the header, the handle, content at its top or that doesn't scroll) moves the sheet.
        const movesSheet =
          Math.abs(dy) >= Math.abs(dx) &&
          (!drag.scroller || (dy < 0 ? !isExpanded() : drag.scroller.scrollTop <= 0));
        if (!movesSheet) {
          drag.mode = 'content';
          return;
        }
        // From the touch's start: when moves arrive in bursts, the first one can be long.
        drag.mode = 'sheet';
        drag.from = currentOffset(sheet);
        container.dataset.sheetDragging = '';
      }
      if (drag.mode !== 'sheet') {
        return;
      }
      event.preventDefault();
      const raw = drag.from + touch.clientY - drag.startY;
      if (raw < 0) {
        drag.offset = -stretch(-raw);
      } else if (raw > drag.lowest && !canClose()) {
        drag.offset = drag.lowest + stretch(raw - drag.lowest);
      } else {
        drag.offset = raw;
      }
      moveTo(drag.offset, drag.lowest);
      drag.samples.push({ y: touch.clientY, time: event.timeStamp });
      if (drag.samples.length > 32) {
        drag.samples.splice(0, 16);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const ended = drag;
      if (!ended || event.touches.length > 0) {
        return;
      }
      drag = null;
      if (ended.mode !== 'sheet') {
        return;
      }
      clicksBlockedUntil = performance.now() + CLICKS_AFTER_DRAG_MS;
      const flick = event.type === 'touchend' ? velocityOf(ended.samples) : 0;
      const projected = ended.offset + flick * FLICK_PROJECTION_MS;
      const startedLow = ended.from >= ended.lowest - 1;
      if (canClose() && startedLow && projected > ended.lowest + space.offsetHeight * CLOSE_SHARE) {
        pullAway();
        return;
      }
      settle(projected < ended.lowest / 2);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() < clicksBlockedUntil) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    // Something below the fold took focus: a count in the header jumping to its section, or the
    // keyboard moving on past the header. Collapsed, the sheet shows only its header, so it opens
    // up to show what was asked for.
    const onFocusIn = (event: FocusEvent) => {
      const isSheet = space.offsetHeight > 0;
      if (isExpanded() || !isSheet || !(event.target instanceof Element)) {
        return;
      }
      const fold = sheet.getBoundingClientRect().top + space.offsetHeight;
      if (event.target.getBoundingClientRect().top >= fold - 1) {
        setExpanded(true);
      }
    };

    // Opened again while it faded where a finger had left it: from its place, not from there.
    letGo();
    sheet.addEventListener('focusin', onFocusIn);
    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);
    sheet.addEventListener('click', onClickCapture, true);
    return () => {
      sheet.removeEventListener('focusin', onFocusIn);
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchEnd);
      sheet.removeEventListener('click', onClickCapture, true);
      if (!heldWhereLeft) {
        letGo();
      }
    };
  }, [open]);

  // Closed: it slides out (`data-sheet-closing`), and goes once it has.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!closing || !sheet) {
      return undefined;
    }
    let gone = false;
    const finish = () => {
      if (!gone) {
        gone = true;
        setShown(null);
      }
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === sheet) {
        finish();
      }
    };
    sheet.addEventListener('transitionend', onEnd);
    // Its slide's end is the usual way out; this is for one that is not there to wait for (from
    // the keyboard), or that never runs (in a hidden view).
    const timer = setTimeout(finish, transitions(sheet) ? CLOSE_TIMEOUT_MS : 0);
    return () => {
      clearTimeout(timer);
      sheet.removeEventListener('transitionend', onEnd);
    };
  }, [closing]);

  // Collapsed, the sheet shows down to the end of its panel's header, which grows with a longer
  // name or a language whose counts take two lines. Until the panel has one (it waits for the
  // text, or says why the text could not be loaded and offers to try again), the sheet shows all
  // of what it holds instead, as far as its full height. The header comes later than the sheet, so
  // the sheet is watched for it.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (!present || !container || !sheet) {
      return undefined;
    }
    let fold: Element | null = null;
    const measure = () => {
      if (fold) {
        const top = sheet.getBoundingClientRect().top;
        const peek = Math.min(fold.getBoundingClientRect().bottom - top, sheet.offsetHeight);
        container.style.setProperty('--sheet-peek', `${Math.ceil(peek)}px`);
      } else {
        container.style.removeProperty('--sheet-peek');
      }
    };
    const sizes = new ResizeObserver(measure);
    const follow = () => {
      const last = sheet.lastElementChild;
      const next =
        sheet.querySelector('header') ?? (last === sheet.firstElementChild ? null : last);
      if (next === fold) {
        return;
      }
      if (fold) {
        sizes.unobserve(fold);
      }
      fold = next;
      if (fold) {
        sizes.observe(fold);
      }
      measure();
    };
    const changes = new MutationObserver(follow);
    changes.observe(sheet, { childList: true, subtree: true });
    follow();
    return () => {
      changes.disconnect();
      sizes.disconnect();
      container.style.removeProperty('--sheet-peek');
    };
  }, [present]);

  return {
    /** What to show in the sheet: the panel, or the one it is leaving with. */
    panel: open ? content : shown,
    /** Whether the sheet is there at all, leaving included. */
    present,
    /** Whether it is on its way out: still shown, but no longer the panel. */
    closing,
    /** Whether, closed from the keyboard, it goes without a slide (`data-sheet-instant`). */
    instant: closing && instant,
    /** Whether the sheet is at its full height (on phones). */
    expanded,
    setExpanded,
    containerRef,
    sheetRef,
    spaceRef,
    scrimRef,
  };
}
