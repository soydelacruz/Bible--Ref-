import type { ClipMaking } from './clip-painter.ts';

/** Where the clip stands, for what shows it. */
export type ClipState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'recording';
      /** In whole percents, as a share of 1. */
      readonly progress: number;
      readonly preview: HTMLCanvasElement;
    }
  | { readonly kind: 'ready'; readonly file: File; readonly preview: HTMLCanvasElement }
  | { readonly kind: 'failed' };

const IDLE: ClipState = { kind: 'idle' };

/**
 * The one clip being made, or just made. It lives outside React: its progress changes many times
 * a second, and only the status that shows it should render for that — not the whole view, while
 * the recording needs every frame on time.
 */
export class ClipJob {
  #state: ClipState = IDLE;
  readonly #listeners = new Set<() => void>();
  #making: ClipMaking | null = null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getState = (): ClipState => this.#state;

  readonly isRecording = (): boolean => this.#state.kind === 'recording';

  /**
   * Makes a clip, unless one is being made already. `make` starts it and is told of its progress;
   * the file it ends in is called `fileName`.
   */
  start(make: (onProgress: (share: number) => void) => ClipMaking, fileName: string): void {
    if (this.#state.kind === 'recording') {
      return;
    }
    let making: ClipMaking | null = null;
    try {
      making = make((share) => {
        if (making) {
          this.#progress(making, share);
        }
      });
    } catch {
      this.#set({ kind: 'failed' });
      return;
    }
    const started = making;
    this.#making = started;
    this.#set({ kind: 'recording', progress: 0, preview: started.preview });
    started.recording.result.then(
      (blob) => {
        if (this.#making !== started) {
          return;
        }
        this.#making = null;
        this.#set(
          blob
            ? {
                kind: 'ready',
                file: new File([blob], fileName, { type: blob.type }),
                preview: started.preview,
              }
            : IDLE,
        );
      },
      () => {
        if (this.#making !== started) {
          return;
        }
        this.#making = null;
        this.#set({ kind: 'failed' });
      },
    );
  }

  /** Stops the clip being made, at once. A clip already made stays. */
  cancel(): void {
    const making = this.#making;
    if (!making) {
      return;
    }
    this.#making = null;
    making.recording.cancel();
    this.#set(IDLE);
  }

  /** Puts away whatever the last clip left: the file made, or the failure. */
  dismiss(): void {
    this.cancel();
    this.#set(IDLE);
  }

  #progress(making: ClipMaking, share: number): void {
    const state = this.#state;
    if (this.#making !== making || state.kind !== 'recording') {
      return;
    }
    // Whole percents: the status renders a hundred times at most, not on every frame.
    const progress = Math.floor(Math.min(Math.max(share, 0), 1) * 100) / 100;
    if (progress !== state.progress) {
      this.#set({ ...state, progress });
    }
  }

  #set(state: ClipState): void {
    if (state === this.#state) {
      return;
    }
    this.#state = state;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
