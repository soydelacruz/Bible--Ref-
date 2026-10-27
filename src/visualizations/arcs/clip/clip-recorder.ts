import type { ClipType } from './clip-format.ts';
import { CLIP_FPS, frameTimeMs } from './clip-timeline.ts';

/** Thin bright lines on black, 1080 px square: sharp at this rate, about 3 MB for 5 seconds. */
const VIDEO_BITS_PER_SECOND = 5_000_000;

export interface ClipRecording {
  /** The clip once recorded, or `null` if it was cancelled first. */
  readonly result: Promise<Blob | null>;
  cancel(): void;
}

export interface RecordOptions {
  readonly canvas: HTMLCanvasElement;
  readonly type: ClipType;
  readonly durationMs: number;
  /** Draws the frame shown at a time from the clip's start. */
  readonly paint: (timeMs: number) => void;
  /** How much of the clip is recorded, in [0, 1]. */
  readonly onProgress: (share: number) => void;
}

/**
 * Plays a clip on its canvas and records it as it plays. A recorder encodes what the canvas shows
 * when it shows it, so a clip takes as long to make as to watch; each frame is drawn on the first
 * animation frame of its turn, and only then. While the page is hidden there are no animation
 * frames: the recording pauses with them rather than filling with a frozen picture, and goes on
 * from the same frame when the page is back.
 */
export function recordClip({
  canvas,
  type,
  durationMs,
  paint,
  onProgress,
}: RecordOptions): ClipRecording {
  const stream = canvas.captureStream(CLIP_FPS);
  const stopTracks = () => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: type.mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
  } catch (error) {
    stopTracks();
    throw error;
  }

  const chunks: Blob[] = [];
  let frame = 0;
  let startedAt = 0;
  let pausedAt: number | null = null;
  let request = 0;
  let cancelled = false;

  const tick = (now: number) => {
    const elapsed = Math.max(now - startedAt, 0);
    if (elapsed >= durationMs) {
      onProgress(1);
      recorder.stop();
      return;
    }
    const next = Math.floor((elapsed * CLIP_FPS) / 1000);
    if (next !== frame) {
      frame = next;
      paint(frameTimeMs(frame));
      onProgress(elapsed / durationMs);
    }
    request = requestAnimationFrame(tick);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (recorder.state === 'recording') {
        cancelAnimationFrame(request);
        recorder.pause();
        pausedAt = performance.now();
      }
    } else if (pausedAt !== null) {
      // The clip's clock stood still while the page was away.
      startedAt += performance.now() - pausedAt;
      pausedAt = null;
      recorder.resume();
      request = requestAnimationFrame(tick);
    }
  };

  const finish = () => {
    cancelAnimationFrame(request);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopTracks();
  };

  const result = new Promise<Blob | null>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener('stop', () => {
      finish();
      if (cancelled) {
        resolve(null);
        return;
      }
      const clip = new Blob(chunks, { type: type.container });
      // An encoder starved of time can hand back nothing: that is no file to offer anyone.
      if (clip.size === 0) {
        reject(new Error('The clip recorded nothing.'));
        return;
      }
      resolve(clip);
    });
    recorder.addEventListener('error', () => {
      finish();
      reject(new Error('The clip could not be recorded.'));
    });
  });

  // The first frame is on the canvas before the recorder starts, so the video opens on it.
  paint(frameTimeMs(0));
  try {
    recorder.start();
  } catch (error) {
    stopTracks();
    throw error;
  }
  startedAt = performance.now();
  onProgress(0);
  document.addEventListener('visibilitychange', onVisibilityChange);
  request = requestAnimationFrame(tick);

  return {
    result,
    cancel: () => {
      if (cancelled || recorder.state === 'inactive') {
        return;
      }
      cancelled = true;
      cancelAnimationFrame(request);
      recorder.stop();
    },
  };
}
