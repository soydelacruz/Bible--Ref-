import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long a first switch to a view waits for the view's code before showing it anyway, with the
 * loading arcs in its place until the code is here, in ms. On a good connection the code is here
 * well within it, and the switch looks as it always has, the passage beacon included; on a slow
 * one the press is still answered promptly.
 */
export const CODE_GRACE_MS = 250;

/**
 * How many times a newly mounted view is drawn, and its work done, before it is shown. Its size
 * comes from a ResizeObserver after a frame, and laying it out at that size can change what is
 * measured next: twice, so that it is drawn at its size and knows where its passages are.
 */
export const SETTLE_ROUNDS = 2;

/** The longest the browser is left to find a quiet moment in each of those rounds, in ms. */
export const IDLE_TIMEOUT_MS = 500;

/**
 * Where the browser cannot say when it has a quiet moment (Safari), how long after a frame to
 * take it that the work the frame set off is done, in ms.
 */
export const IDLE_FALLBACK_MS = 50;

/** A switch waiting for the view it shows to be ready. */
interface Waiting<Id extends string> {
  readonly id: Id;
  /** Shows it now, unless a later request has taken its place. */
  readonly show: () => void;
  readonly cancel: () => void;
}

export interface ViewOpening<Id extends string> {
  /**
   * The views opened so far, to keep mounted. The one on screen is to be mounted too, whether or
   * not it is listed yet: a view can be shown without being asked for first (a step back that the
   * browser showed its own way, or the one the page opens on), and joins once it has mounted.
   */
  readonly opened: ReadonlySet<Id>;
  /**
   * Runs `show` once view `id` can be shown as if it had been there all along: at once if it has
   * been opened before. If not, it is mounted out of sight and `show` waits for it to settle, and
   * for its code no longer than `CODE_GRACE_MS`. A later request takes the place of one still
   * waiting.
   */
  readonly whenOpen: (id: Id, show: () => void) => void;
  /**
   * Drops the switch still waiting, if there is one: something shown since — in the view on
   * screen, which has nothing to wait for — takes its place.
   */
  readonly cancel: () => void;
  /**
   * Says that what view `id` shows first is on the page — the view itself, the frame it waits
   * for its words in, or the error it failed with — or, with `false`, that it has gone again.
   */
  readonly onMounted: (id: Id, isMounted: boolean) => void;
}

/**
 * Calls `callback` when the browser next has nothing to do — when what a frame set off (a
 * ResizeObserver's news, the render it asks for, that render's effects) has all run; where there
 * is no way to ask, after `IDLE_FALLBACK_MS`. Returns a function that calls it off.
 */
function whenIdle(callback: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const request = requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return () => {
      cancelIdleCallback(request);
    };
  }
  const timer = setTimeout(callback, IDLE_FALLBACK_MS);
  return () => {
    clearTimeout(timer);
  };
}

/**
 * Calls `callback` once a newly mounted view has settled: `SETTLE_ROUNDS` times, a frame is drawn
 * and the work it set off is done. Counting frames alone is not enough, for the browser can draw
 * the next one before the render a measurement asked for. At once on a page out of sight, which
 * draws nothing. Returns a function that calls it off.
 */
function afterSettling(callback: () => void): () => void {
  if (document.hidden) {
    callback();
    return () => undefined;
  }
  let cancel: () => void = () => undefined;
  const round = (left: number) => {
    const frame = requestAnimationFrame(() => {
      cancel = whenIdle(() => {
        if (left > 1) {
          round(left - 1);
        } else {
          callback();
        }
      });
    });
    cancel = () => {
      cancelAnimationFrame(frame);
    };
  };
  round(SETTLE_ROUNDS);
  return () => {
    cancel();
  };
}

/**
 * Mounts each view the first time it is opened rather than all of them at once, and keeps it
 * mounted from then on, so the page downloads and draws only what the reader looks at and
 * switching back stays instant. `load` starts downloading a view's code.
 *
 * A view opened for the first time is mounted out of sight, as a hidden one always was, before it
 * is shown: it brings the focused passage into place there, and a switch to it finds the passage
 * where it is drawn.
 */
export function useViewOpening<Id extends string>(
  load: (id: Id) => Promise<unknown>,
): ViewOpening<Id> {
  const [opened, setOpened] = useState<ReadonlySet<Id>>(() => new Set());
  const open = useCallback((id: Id) => {
    setOpened((views) => (views.has(id) ? views : new Set([...views, id])));
  }, []);
  const ready = useRef(new Set<Id>());
  const settling = useRef(new Map<Id, () => void>());
  const waiting = useRef<Waiting<Id> | null>(null);

  useEffect(() => {
    const frames = settling.current;
    return () => {
      waiting.current?.cancel();
      for (const cancel of frames.values()) cancel();
    };
  }, []);

  const onMounted = useCallback(
    (id: Id, isMounted: boolean) => {
      settling.current.get(id)?.();
      settling.current.delete(id);
      if (!isMounted) {
        ready.current.delete(id);
        return;
      }
      open(id);
      settling.current.set(
        id,
        afterSettling(() => {
          settling.current.delete(id);
          ready.current.add(id);
          if (waiting.current?.id === id) waiting.current.show();
        }),
      );
    },
    [open],
  );

  const cancel = useCallback(() => {
    waiting.current?.cancel();
    waiting.current = null;
  }, []);

  const whenOpen = useCallback(
    (id: Id, show: () => void) => {
      cancel();
      if (ready.current.has(id)) {
        show();
        return;
      }
      let codeHere = false;
      let timer = 0;
      const request: Waiting<Id> = {
        id,
        show: () => {
          if (waiting.current === request) {
            request.cancel();
            waiting.current = null;
            show();
          }
        },
        cancel: () => {
          window.clearTimeout(timer);
        },
      };
      waiting.current = request;
      timer = window.setTimeout(() => {
        if (!codeHere) request.show();
      }, CODE_GRACE_MS);
      // Code that fails to arrive is shown at once: the view's frame says what went wrong.
      void load(id).then(() => {
        codeHere = true;
      }, request.show);
      open(id);
    },
    [cancel, load, open],
  );

  return { opened, whenOpen, cancel, onMounted };
}
