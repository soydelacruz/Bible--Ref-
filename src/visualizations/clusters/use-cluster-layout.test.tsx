import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KJV_CHAPTER_VERSE_COUNTS } from '../../core/bible/kjv-versification.ts';
import { CANONICAL_VERSIFICATION, Versification } from '../../core/bible/versification.ts';
import { serveRequests } from '../../core/lib/worker-rpc.ts';
import { verseIndex } from '../../test-utils/fixtures.ts';
import { answerLayoutRequest } from './cluster-layout-messages.ts';
import { computeClusterLayout, type ClusterGraph } from './cluster-layout.ts';
import { layoutClusters, useClusterLayout } from './use-cluster-layout.ts';

const versification = CANONICAL_VERSIFICATION;

function graphOf(...verses: number[]): ClusterGraph {
  return { linkIds: Int32Array.from([0]), nodes: Int32Array.from(verses) };
}

const GRAPH = graphOf(verseIndex('Gen', 1, 1), verseIndex('John', 1, 1));
const OTHER = graphOf(verseIndex('Ps', 23, 1), verseIndex('Rev', 22, 21));
const SIZE = { width: 1200, height: 800 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

interface Props {
  readonly graph: ClusterGraph | null;
  readonly size: { readonly width: number; readonly height: number };
}

function renderLayout(initialProps: Props) {
  return renderHook(
    ({ graph, size }: Props) => useClusterLayout(graph, versification, null, size),
    { initialProps },
  );
}

describe('useClusterLayout', () => {
  it('gives the graph with its layout once the layout is worked out', async () => {
    const { result } = renderLayout({ graph: GRAPH, size: SIZE });
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current?.graph).toBe(GRAPH);
    });
    expect(result.current?.layout).toEqual(computeClusterLayout(GRAPH, versification, null, SIZE));
  });

  it('keeps the last pair while the next is on its way, so the stage draws a whole picture', async () => {
    const { result, rerender } = renderLayout({ graph: GRAPH, size: SIZE });
    await waitFor(() => {
      expect(result.current?.graph).toBe(GRAPH);
    });
    rerender({ graph: OTHER, size: SIZE });
    expect(result.current?.graph).toBe(GRAPH);
    await waitFor(() => {
      expect(result.current?.graph).toBe(OTHER);
    });
  });

  it('ends on the newest size however many it was asked for meanwhile', async () => {
    const { result, rerender } = renderLayout({ graph: GRAPH, size: SIZE });
    for (const width of [900, 950, 1000, 1050]) {
      rerender({ graph: GRAPH, size: { width, height: 700 } });
    }
    await waitFor(() => {
      expect(result.current?.layout.width).toBe(1050);
    });
  });

  it('forgets its picture while there is nothing to draw, so a view coming back starts afresh', async () => {
    const { result, rerender } = renderLayout({ graph: GRAPH, size: SIZE });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    rerender({ graph: null, size: SIZE });
    expect(result.current).toBeNull();
    rerender({ graph: GRAPH, size: { width: 0, height: 0 } });
    expect(result.current).toBeNull();
    rerender({ graph: OTHER, size: SIZE });
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current?.graph).toBe(OTHER);
    });
  });

  it('drops a layout that lands after the view has gone', async () => {
    const { result, rerender, unmount } = renderLayout({ graph: GRAPH, size: SIZE });
    rerender({ graph: null, size: SIZE });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
    unmount();
  });
});

/** A layout worker in this thread, on a real message channel. */
function stubWorker(handle: (message: unknown) => ReturnType<typeof answerLayoutRequest>) {
  const started: string[] = [];
  class InThreadWorker {
    readonly #port: MessagePort;
    constructor(url: URL) {
      started.push(url.href);
      const { port1, port2 } = new MessageChannel();
      serveRequests(port1, handle);
      port1.start();
      this.#port = port2;
    }
    addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') {
        this.#port.addEventListener('message', listener);
        this.#port.start();
      }
    }
    postMessage(message: unknown, transfer: Transferable[]): void {
      this.#port.postMessage(message, transfer);
    }
  }
  vi.stubGlobal('Worker', InThreadWorker);
  return started;
}

/**
 * The hook's module loaded afresh, so it starts the stubbed worker, with the versification it
 * now knows as canonical (a fresh module graph has its own).
 */
async function freshModules() {
  const fresh = await import('./use-cluster-layout.ts');
  const { CANONICAL_VERSIFICATION: canonical } = await import('../../core/bible/versification.ts');
  return { fresh, canonical };
}

describe('layoutClusters', () => {
  it('lays the clusters out in the worker, leaving the graph its own verses', async () => {
    const started = stubWorker(answerLayoutRequest);
    const { fresh, canonical } = await freshModules();
    const layout = await fresh.layoutClusters(GRAPH, canonical, 'John', SIZE);
    expect(started).toEqual([expect.stringContaining('cluster-layout.worker.ts')]);
    expect(layout.nodes).toBe(GRAPH.nodes);
    expect(GRAPH.nodes.byteLength).toBeGreaterThan(0);
    expect(layout.groups.some((group) => group.chapter !== null)).toBe(true);
  });

  it('works the layout out here when the worker fails', async () => {
    stubWorker(() => {
      throw new Error('out of memory');
    });
    const { fresh, canonical } = await freshModules();
    expect(await fresh.layoutClusters(GRAPH, canonical, null, SIZE)).toEqual(
      computeClusterLayout(GRAPH, versification, null, SIZE),
    );
  });

  it('works it out here for a versification the worker does not know', async () => {
    const other = new Versification('kjv', KJV_CHAPTER_VERSE_COUNTS);
    expect(await layoutClusters(GRAPH, other, null, SIZE)).toEqual(
      computeClusterLayout(GRAPH, other, null, SIZE),
    );
  });
});
