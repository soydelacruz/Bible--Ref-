import { useSyncExternalStore } from 'react';

/**
 * The way to start the arcs' tour from outside the arcs: the first visit's Start here strip, in
 * the app, offers it beside its other ways in.
 *
 * A module of its own, free of the tour's code, so that the app can import it without pulling the
 * tour into its first chunk: the arcs' chunk listens and says whether there is a tour to take, and
 * the app only asks.
 */

const requests = new Set<() => void>();

/**
 * Starts the arcs' tour, as their own Take the tour button does. It plays once the arcs are on
 * screen, and is never offered again.
 */
export function startArcsTour(): void {
  for (const request of requests) {
    request();
  }
}

/** Listens for `startArcsTour` (see `useArcsTour`); returns the way to stop. */
export function onTourRequest(listener: () => void): () => void {
  requests.add(listener);
  return () => {
    requests.delete(listener);
  };
}

/**
 * Whether the reader's filter leaves a tour to take. Assumed until the arcs say otherwise: the
 * default filter always does.
 */
let available = true;
const availabilityListeners = new Set<() => void>();

function subscribeToAvailability(onChange: () => void): () => void {
  availabilityListeners.add(onChange);
  return () => {
    availabilityListeners.delete(onChange);
  };
}

/** Says whether there is a tour to take under the reader's filter (see `useArcsTour`). */
export function setArcsTourAvailable(value: boolean): void {
  if (available === value) {
    return;
  }
  available = value;
  for (const listener of availabilityListeners) {
    listener();
  }
}

/** Whether `startArcsTour` has a tour to start: none when the filter hides every stop. */
export function useArcsTourAvailable(): boolean {
  return useSyncExternalStore(
    subscribeToAvailability,
    () => available,
    () => true,
  );
}
