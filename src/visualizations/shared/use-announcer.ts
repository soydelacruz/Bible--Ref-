import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Long enough for a screen reader to notice that the region emptied before it fills again. */
export const ANNOUNCE_DELAY_MS = 100;
/**
 * How long a message stays. It has been read by then; left longer, a reader moving through the
 * page would come across "John 3:16 copied" long after the fact.
 */
export const ANNOUNCEMENT_MS = 3000;

interface Timers {
  say?: ReturnType<typeof setTimeout>;
  clear?: ReturnType<typeof setTimeout>;
}

/**
 * One polite live region, and a way to speak through it: what a screen reader should hear about
 * a change it cannot see, e.g. "John 3:16 copied", or the passage the arcs just opened.
 *
 * The region has to be on the page before it changes for the change to be read, so it is written
 * to rather than rendered with its message; and it is emptied first, so the same words twice are
 * read twice.
 */
export function useAnnouncer<Region extends HTMLElement>(): readonly [
  RefObject<Region | null>,
  (message: string) => void,
] {
  const region = useRef<Region>(null);
  const timers = useRef<Timers>({});
  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.say);
      clearTimeout(pending.clear);
    };
  }, []);
  const announce = useCallback((message: string) => {
    const node = region.current;
    if (!node) {
      return;
    }
    const pending = timers.current;
    clearTimeout(pending.say);
    clearTimeout(pending.clear);
    node.textContent = '';
    pending.say = setTimeout(() => {
      node.textContent = message;
      pending.clear = setTimeout(() => {
        node.textContent = '';
      }, ANNOUNCEMENT_MS);
    }, ANNOUNCE_DELAY_MS);
  }, []);
  return [region, announce];
}
