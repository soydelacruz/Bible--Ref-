import { vi } from 'vitest';
import type { ClipMaking } from '../visualizations/arcs/clip/clip-painter.ts';

/**
 * A video clip being made, without a canvas to draw it or a recorder to record it: the test says
 * how far it has got and how it ends.
 */
export function fakeClipMaking() {
  let finish: (blob: Blob | null) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const result = new Promise<Blob | null>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const cancel = vi.fn();
  const making: ClipMaking = {
    preview: document.createElement('canvas'),
    recording: { result, cancel },
  };
  let progress: (share: number) => void = () => undefined;
  const make = vi.fn((onProgress: (share: number) => void) => {
    progress = onProgress;
    return making;
  });
  return {
    making,
    /** What `ClipJob.start` is given. */
    make,
    cancel,
    progress: (share: number) => {
      progress(share);
    },
    finish: async (blob: Blob | null) => {
      finish(blob);
      await result;
    },
    fail: async (error: unknown) => {
      fail(error);
      await result.catch(() => undefined);
    },
  };
}
