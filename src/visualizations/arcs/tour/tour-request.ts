/**
 * The way to start the arcs' tour from outside the arcs: the first visit's Start here strip, in
 * the app, offers it beside its other ways in.
 *
 * A module of its own, free of the tour's code, so that the app can import it without pulling the
 * tour into its first chunk: the arcs' chunk listens, and the app only asks.
 */

const listeners = new Set<() => void>();

/**
 * Starts the arcs' tour, as their own Take the tour button does. It plays once the arcs are on
 * screen, and is never offered again.
 */
export function startArcsTour(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Listens for `startArcsTour` (see `useArcsTour`); returns the way to stop. */
export function onTourRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
