import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, type WorkerLike } from '../../core/lib/worker-rpc.ts';
import { verseIndex } from '../../test-utils/fixtures.ts';
import { acceptClusterLayout } from './cluster-layout-messages.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the Clusters layout worker', () => {
  it('lays out the verses it is sent', async () => {
    const { port1, port2 } = new MessageChannel();
    vi.stubGlobal('self', port1);
    await import('./cluster-layout.worker.ts');
    port1.start();
    const worker: WorkerLike = {
      addEventListener: (type: string, listener: (event: MessageEvent<unknown>) => void) => {
        if (type === 'message') {
          port2.addEventListener('message', listener);
          port2.start();
        }
      },
      postMessage: (message, transfer) => {
        port2.postMessage(message, transfer);
      },
    };
    const client = new WorkerClient(() => worker);
    const nodes = Int32Array.from([verseIndex('Gen', 1, 1), verseIndex('John', 3, 16)]);
    const sent = nodes.slice();
    const layout = await client.run(
      { nodes: sent, openBook: null, width: 1000, height: 700 },
      [sent.buffer],
      (value) => acceptClusterLayout(value, nodes),
      () => {
        throw new Error('Expected the worker to answer.');
      },
    );
    expect(layout.groups.map((group) => group.book)).toEqual(['Gen', 'John']);
    expect(sent.byteLength).toBe(0);
  });
});
