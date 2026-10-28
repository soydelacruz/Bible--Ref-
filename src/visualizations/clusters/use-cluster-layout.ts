import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookId } from '../../core/bible/books.ts';
import { CANONICAL_VERSIFICATION, type Versification } from '../../core/bible/versification.ts';
import { WorkerClient } from '../../core/lib/worker-rpc.ts';
import { acceptClusterLayout, type LayoutRequest } from './cluster-layout-messages.ts';
import { computeClusterLayout, type ClusterGraph, type ClusterLayout } from './cluster-layout.ts';

interface Size {
  readonly width: number;
  readonly height: number;
}

const layoutWorker = new WorkerClient(() =>
  typeof Worker === 'function'
    ? new Worker(new URL('./cluster-layout.worker.ts', import.meta.url), { type: 'module' })
    : null,
);

/**
 * Lays the clusters out in the layout worker, or here where there is none (or for a
 * versification the worker does not know). The worker gets a copy of the graph's verses, so the
 * graph keeps its own.
 */
export async function layoutClusters(
  graph: ClusterGraph,
  versification: Versification,
  openBook: BookId | null,
  size: Size,
): Promise<ClusterLayout> {
  const here = () => computeClusterLayout(graph, versification, openBook, size);
  if (versification !== CANONICAL_VERSIFICATION) {
    return here();
  }
  const request: LayoutRequest = {
    nodes: graph.nodes.slice(),
    openBook,
    width: size.width,
    height: size.height,
  };
  try {
    return await layoutWorker.run(
      request,
      [request.nodes.buffer],
      (value) => acceptClusterLayout(value, graph.nodes),
      here,
    );
  } catch {
    // A worker that died mid-way: the picture is still owed, so it is worked out here.
    return here();
  }
}

/** A graph and the layout made for it: the stage draws them together, never one without the other. */
export interface PlacedClusters {
  readonly graph: ClusterGraph;
  readonly layout: ClusterLayout;
  /**
   * The book open in this picture. Its heading goes with the layout, not with the book just
   * asked for, whose layout may still be on its way.
   */
  readonly openBook: BookId | null;
  /** Whether a newer layout is on its way, so the picture is about to change. */
  readonly pending?: boolean;
}

interface Wanted {
  readonly graph: ClusterGraph;
  readonly versification: Versification;
  readonly openBook: BookId | null;
  readonly size: Size;
}

/** A layout, and what it was asked for with. */
interface Placed extends PlacedClusters {
  readonly wanted: Wanted;
}

/**
 * The layout of `graph`, worked out off the main thread. Until a new layout arrives, the previous
 * graph and its layout are kept, so the stage goes on drawing a picture that is whole, and glides
 * from it when the new one lands. One layout is worked out at a time: while one is running, newer
 * asks replace each other, and only the latest is worked out next — a window being dragged wider
 * asks for dozens.
 *
 * A view shown with nothing laid out yet is laid out here and now, as it always was: the passage
 * beacon looks for the passage the moment the view is shown. A graph given while the view is
 * hidden is laid out in the worker, ready for it; the stage gives none, so that a hidden view
 * costs the others nothing.
 *
 * `null` while the view is hidden, or has no graph or no room to draw it.
 */
export function useClusterLayout(
  graph: ClusterGraph | null,
  versification: Versification,
  openBook: BookId | null,
  size: Size,
  active: boolean,
): PlacedClusters | null {
  const [placed, setPlaced] = useState<Placed | null>(null);
  const wanted = useMemo(
    (): Wanted | null =>
      graph && size.width > 0 && size.height > 0 ? { graph, versification, openBook, size } : null,
    [graph, versification, openBook, size],
  );
  if (wanted === null && placed !== null) {
    setPlaced(null);
  }
  if (active && wanted !== null && placed === null) {
    const layout = computeClusterLayout(wanted.graph, versification, openBook, size);
    setPlaced({ graph: wanted.graph, layout, openBook, wanted });
  }

  // What the effects below go by: the newest ask, whether a layout is being worked out, and what
  // the one in place was made for.
  const latest = useRef<Wanted | null>(null);
  const running = useRef(false);
  const inPlace = useRef<Wanted | null>(null);
  useEffect(() => {
    inPlace.current = placed?.wanted ?? null;
  }, [placed]);

  // A view laid out here still has the worker started, so that the next layout (the first book
  // opened) does not wait for it to load.
  useEffect(() => {
    if (active) {
      layoutWorker.warm();
    }
  }, [active]);

  useEffect(() => {
    latest.current = wanted;
    const next = () => {
      const inputs = latest.current;
      if (inputs === null || running.current || inputs === inPlace.current) {
        return;
      }
      running.current = true;
      void layoutClusters(inputs.graph, inputs.versification, inputs.openBook, inputs.size).then(
        (layout) => {
          running.current = false;
          if (latest.current === null) {
            return;
          }
          // Kept even when a newer one is wanted, which is worked out next: it is nearer to that
          // than what is on screen. Not over the same layout worked out here meanwhile, though,
          // which would glide the dots nowhere.
          inPlace.current = inputs;
          setPlaced((current) =>
            current?.wanted === inputs
              ? current
              : { graph: inputs.graph, layout, openBook: inputs.openBook, wanted: inputs },
          );
          next();
        },
      );
    };
    next();
  }, [wanted]);

  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );

  if (!active || placed === null) {
    return null;
  }
  return placed.wanted === wanted ? placed : { ...placed, pending: true };
}
