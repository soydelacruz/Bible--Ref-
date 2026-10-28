import { useEffect, useRef, useState } from 'react';
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
}

interface Wanted {
  readonly graph: ClusterGraph;
  readonly versification: Versification;
  readonly openBook: BookId | null;
  readonly size: Size;
}

/**
 * The layout of `graph`, worked out off the main thread. Until it arrives, the previous graph and
 * its layout are kept, so the stage goes on drawing a picture that is whole, and glides from it
 * when the new one lands. One layout is worked out at a time: while one is running, newer asks
 * replace each other, and only the latest is worked out next — a window being dragged wider asks
 * for dozens.
 *
 * `null` while there is no graph or no room to draw it: a view coming back is then drawn as it
 * is, rather than glided into from how it was when it left.
 */
export function useClusterLayout(
  graph: ClusterGraph | null,
  versification: Versification,
  openBook: BookId | null,
  size: Size,
): PlacedClusters | null {
  const [placed, setPlaced] = useState<PlacedClusters | null>(null);
  const wanted = useRef<Wanted | null>(null);
  const running = useRef(false);
  const shown = graph !== null && size.width > 0 && size.height > 0;
  if (!shown && placed !== null) {
    setPlaced(null);
  }

  useEffect(() => {
    const next = shown ? { graph, versification, openBook, size } : null;
    wanted.current = next;
    if (next === null || running.current) {
      return;
    }
    const run = (inputs: Wanted) => {
      running.current = true;
      void layoutClusters(inputs.graph, inputs.versification, inputs.openBook, inputs.size).then(
        (layout) => {
          running.current = false;
          const latest = wanted.current;
          if (latest === null) {
            return;
          }
          // Shown even when a newer one is wanted: it is nearer to that than what is on screen.
          setPlaced({ graph: inputs.graph, layout });
          if (latest !== inputs) {
            run(latest);
          }
        },
      );
    };
    run(next);
  }, [shown, graph, versification, openBook, size]);

  useEffect(
    () => () => {
      wanted.current = null;
    },
    [],
  );

  return placed;
}
