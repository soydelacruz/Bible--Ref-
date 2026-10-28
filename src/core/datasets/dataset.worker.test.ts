import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslationFile } from '../../test-utils/fixtures.ts';
import { ValidationError } from '../lib/validation.ts';
import { WorkerClient, type WorkerLike } from '../lib/worker-rpc.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Loads the worker's script with one end of a channel as its `self`, and talks to the other. */
async function startWorker(): Promise<WorkerClient> {
  const { port1, port2 } = new MessageChannel();
  vi.stubGlobal('self', port1);
  await import('./dataset.worker.ts');
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
  return new WorkerClient(() => worker);
}

describe('the dataset worker', () => {
  it('reads a file it is handed, and says what is wrong with one it cannot', async () => {
    const client = await startWorker();
    const bytes = new TextEncoder().encode(JSON.stringify(createTranslationFile())).buffer;
    const request = { kind: 'translation', expected: { id: 'bsb', versification: 'kjv' } };
    const nowhere = () => {
      throw new Error('Expected the worker to answer.');
    };
    const verses = await client.run(
      { ...request, buffer: bytes },
      [bytes],
      (value) => value,
      nowhere,
    );
    expect(verses).toMatchObject({ translationId: 'bsb' });
    expect(bytes.byteLength).toBe(0);

    const broken = new TextEncoder().encode('{').buffer;
    await expect(
      client.run({ ...request, buffer: broken }, [broken], (value) => value, nowhere),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
