import { isRecord, ValidationError } from './validation.ts';

/**
 * Requests to a dedicated worker and its answers, with the work done on the calling thread
 * instead wherever no worker can run.
 *
 * The worker says it is ready before anything is sent to it. Buffers are handed over rather than
 * copied, which leaves them unusable here, so they are only handed to a worker known to be
 * running: one whose script never loaded (offline before the offline cache had it, a blocked
 * script) costs nothing but the wait, and the work happens here with the bytes still intact.
 */

/** The parts of a worker this uses; a real `Worker` is one. */
export interface WorkerLike {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/** The parts of a worker's own global scope this uses; a dedicated worker's `self` is one. */
export interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: unknown, options?: StructuredSerializeOptions): void;
}

/** What the worker answers, and which of its buffers it hands back. */
export interface WorkerResult {
  readonly value: unknown;
  readonly transfer: readonly Transferable[];
}

const READY = 'worker-ready';

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

/**
 * An error as it crosses between threads, and back. A `ValidationError` stays one, since it is
 * what tells a loader to try a fresh copy of a file.
 */
function packError(error: unknown): { name: string; message: string; path: string | null } {
  if (error instanceof ValidationError) {
    return { name: error.name, message: error.message, path: error.path };
  }
  return error instanceof Error
    ? { name: error.name, message: error.message, path: null }
    : { name: 'Error', message: String(error), path: null };
}

function unpackError(packed: unknown): Error {
  if (!isRecord(packed)) {
    return new Error('The worker failed without saying why.');
  }
  const { name, message, path } = packed;
  const text = typeof message === 'string' ? message : 'The worker failed without saying why.';
  if (name === 'ValidationError' && typeof path === 'string') {
    const prefix = `${path}: `;
    return new ValidationError(path, text.startsWith(prefix) ? text.slice(prefix.length) : text);
  }
  const error = new Error(text);
  error.name = typeof name === 'string' ? name : 'Error';
  return error;
}

export class WorkerClient {
  readonly #create: () => WorkerLike | null;
  #worker: WorkerLike | null = null;
  #ready: Promise<boolean> | null = null;
  #stopped = false;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();

  /** `create` starts the worker, or returns `null` where there is none to be had. */
  constructor(create: () => WorkerLike | null) {
    this.#create = create;
  }

  /** Starts the worker now, so that its script loads while something else does. */
  warm(): void {
    void this.#start();
  }

  /**
   * Has the worker answer `request`, handing it `transfer`, and reads the answer with `accept`;
   * where no worker runs, returns `here()` instead.
   */
  async run<T>(
    request: unknown,
    transfer: readonly Transferable[],
    accept: (value: unknown) => T,
    here: () => T | Promise<T>,
  ): Promise<T> {
    const worker = (await this.#start()) && !this.#stopped ? this.#worker : null;
    if (worker === null) {
      return here();
    }
    const id = this.#nextId;
    this.#nextId += 1;
    const value = await new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      worker.postMessage({ id, request }, [...transfer]);
    });
    return accept(value);
  }

  #start(): Promise<boolean> {
    if (this.#ready !== null) {
      return this.#ready;
    }
    let worker: WorkerLike | null;
    try {
      worker = this.#create();
    } catch {
      worker = null;
    }
    if (worker === null) {
      this.#ready = Promise.resolve(false);
      return this.#ready;
    }
    this.#worker = worker;
    this.#ready = new Promise<boolean>((resolve) => {
      worker.addEventListener('message', (event) => {
        if (event.data === READY) {
          resolve(true);
        } else {
          this.#answer(event.data);
        }
      });
      // Before it is ready, a failed script; after, a worker that died. Either way nothing more
      // is sent to it: what is waiting fails, and what comes next is done here.
      worker.addEventListener('error', () => {
        resolve(false);
        this.#stop(new Error('The worker stopped.'));
      });
      worker.addEventListener('messageerror', () => {
        this.#stop(new Error("The worker's answer could not be read."));
      });
    });
    return this.#ready;
  }

  #answer(data: unknown): void {
    if (!isRecord(data) || typeof data['id'] !== 'number') {
      return;
    }
    const pending = this.#pending.get(data['id']);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(data['id']);
    if ('error' in data) {
      pending.reject(unpackError(data['error']));
    } else {
      pending.resolve(data['value']);
    }
  }

  #stop(error: Error): void {
    this.#stopped = true;
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

/**
 * The worker's side: answers each request with `handle`, handing back the buffers it names, and
 * says it is ready.
 */
export function serveRequests(
  scope: WorkerScope,
  handle: (request: unknown) => WorkerResult | Promise<WorkerResult>,
): void {
  scope.addEventListener('message', (event) => {
    const data = event.data;
    if (!isRecord(data) || typeof data['id'] !== 'number') {
      return;
    }
    const id = data['id'];
    const answer = async () => {
      try {
        const { value, transfer } = await handle(data['request']);
        scope.postMessage({ id, value }, { transfer: [...transfer] });
      } catch (error) {
        scope.postMessage({ id, error: packError(error) });
      }
    };
    void answer();
  });
  scope.postMessage(READY);
}
