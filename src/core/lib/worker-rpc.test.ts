import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from './validation.ts';
import { serveRequests, WorkerClient, type WorkerLike } from './worker-rpc.ts';

/**
 * A worker in this thread: the client talks to one end of a real message channel and
 * `serveRequests` answers on the other, so handing buffers over really does take them away.
 */
class ChannelWorker implements WorkerLike {
  readonly #port: MessagePort;
  readonly #failures = new EventTarget();

  constructor(handle: Parameters<typeof serveRequests>[1]) {
    const { port1, port2 } = new MessageChannel();
    serveRequests(port1, handle);
    port1.start();
    this.#port = port2;
  }

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void;
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') {
      this.#port.addEventListener('message', listener);
      this.#port.start();
    } else {
      this.#failures.addEventListener(type, () => {
        listener(new MessageEvent(type));
      });
    }
  }

  postMessage(message: unknown, transfer: Transferable[]): void {
    this.#port.postMessage(message, transfer);
  }

  /** What a browser does when the worker's script cannot load, or the worker dies. */
  fail(type: 'error' | 'messageerror' = 'error'): void {
    this.#failures.dispatchEvent(new Event(type));
  }
}

const identity = (value: unknown) => value;
const nowhere = () => {
  throw new Error('Expected the worker to answer.');
};

describe('a worker client', () => {
  it('has the worker answer, handing buffers over rather than copying them', async () => {
    const client = new WorkerClient(
      () =>
        new ChannelWorker((request) => {
          const bytes = request instanceof ArrayBuffer ? new Uint8Array(request) : new Uint8Array();
          const doubled = Int32Array.from(bytes, (byte) => byte * 2);
          return { value: doubled, transfer: [doubled.buffer] };
        }),
    );
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const answer = await client.run(buffer, [buffer], identity, nowhere);
    expect(answer).toEqual(Int32Array.from([2, 4, 6]));
    // Handed over: this thread no longer has it.
    expect(buffer.byteLength).toBe(0);
  });

  it('starts the worker once, however many requests it sends', async () => {
    const create = vi.fn(() => new ChannelWorker((request) => ({ value: request, transfer: [] })));
    const client = new WorkerClient(create);
    client.warm();
    const answers = await Promise.all([1, 2, 3].map((n) => client.run(n, [], identity, nowhere)));
    expect(answers).toEqual([1, 2, 3]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reads the answer with the reader it is given', async () => {
    const client = new WorkerClient(
      () => new ChannelWorker(() => ({ value: 'forty-two', transfer: [] })),
    );
    expect(await client.run(null, [], (value) => String(value).length, nowhere)).toBe(9);
  });

  it('does the work here where there is no worker to be had', async () => {
    const client = new WorkerClient(() => null);
    expect(await client.run('request', [], identity, () => 'here')).toBe('here');
  });

  it('does the work here when the worker cannot even be started', async () => {
    const client = new WorkerClient(() => {
      throw new Error('blocked');
    });
    expect(await client.run('request', [], identity, () => 'here')).toBe('here');
  });

  it('does the work here, with its buffers intact, when the worker’s script never loads', async () => {
    const worker = new ChannelWorker(() => ({ value: 'there', transfer: [] }));
    const client = new WorkerClient(() => worker);
    client.warm();
    // The script fails before the worker can say it is ready.
    worker.fail();
    const buffer = new ArrayBuffer(8);
    expect(await client.run(buffer, [buffer], identity, () => buffer.byteLength)).toBe(8);
  });

  it('fails what is waiting when the worker dies, and does what comes next here', async () => {
    const made: ChannelWorker[] = [];
    const client = new WorkerClient(() => {
      made.push(new ChannelWorker(() => new Promise<never>(() => undefined)));
      return made[0] ?? null;
    });
    const waiting = client.run('stuck', [], identity, nowhere);
    // Give the worker's "ready" time to arrive before it dies.
    await new Promise((resolve) => setTimeout(resolve, 10));
    made[0]?.fail();
    await expect(waiting).rejects.toThrow('The worker stopped.');
    expect(await client.run('next', [], identity, () => 'here')).toBe('here');
  });

  it('fails what is waiting when an answer cannot be read', async () => {
    const made: ChannelWorker[] = [];
    const client = new WorkerClient(() => {
      made.push(new ChannelWorker(() => new Promise<never>(() => undefined)));
      return made[0] ?? null;
    });
    const waiting = client.run('stuck', [], identity, nowhere);
    await new Promise((resolve) => setTimeout(resolve, 10));
    made[0]?.fail('messageerror');
    await expect(waiting).rejects.toThrow("The worker's answer could not be read.");
  });

  it('passes on a ValidationError as one, so a loader still knows to fetch a fresh copy', async () => {
    const client = new WorkerClient(
      () =>
        new ChannelWorker(() => {
          throw new ValidationError('cross-references', 'the file is truncated');
        }),
    );
    const error = await client.run(null, [], identity, nowhere).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      path: 'cross-references',
      message: 'cross-references: the file is truncated',
    });
  });

  it('passes on any other failure with its name and message', async () => {
    const client = new WorkerClient(
      () =>
        new ChannelWorker(() => {
          throw new RangeError('too far');
        }),
    );
    await expect(client.run(null, [], identity, nowhere)).rejects.toMatchObject({
      name: 'RangeError',
      message: 'too far',
    });
  });

  it('passes on a failure that is not an Error', async () => {
    const client = new WorkerClient(
      () =>
        new ChannelWorker(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- what is being tested
          throw 'a string';
        }),
    );
    await expect(client.run(null, [], identity, nowhere)).rejects.toThrow('a string');
  });
});

describe('the serving side', () => {
  it('says it is ready, then answers only what looks like a request', async () => {
    const posted: unknown[] = [];
    const listeners: ((event: MessageEvent<unknown>) => void)[] = [];
    serveRequests(
      {
        addEventListener: (_type, listener) => listeners.push(listener),
        postMessage: (message) => posted.push(message),
      },
      (request) => ({ value: request, transfer: [] }),
    );
    expect(posted).toEqual(['worker-ready']);
    for (const data of ['noise', { id: 'one' }, { id: 1, request: 'echo' }]) {
      for (const listener of listeners) listener(new MessageEvent('message', { data }));
    }
    await vi.waitFor(() => {
      expect(posted).toEqual(['worker-ready', { id: 1, value: 'echo' }]);
    });
  });
});

describe('a worker client reading answers', () => {
  it('ignores answers it did not ask for, and garbled ones', async () => {
    const { port1, port2 } = new MessageChannel();
    port1.start();
    port1.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      const id = typeof data === 'object' && data !== null && 'id' in data ? data.id : null;
      port1.postMessage('noise');
      port1.postMessage({ id: 999, value: 'not mine' });
      port1.postMessage({ id, error: 'garbled' });
    });
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
    port1.postMessage('worker-ready');
    const client = new WorkerClient(() => worker);
    await expect(client.run('request', [], identity, nowhere)).rejects.toThrow(
      'The worker failed without saying why.',
    );
  });
});
