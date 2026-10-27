import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipType } from './clip-format.ts';
import { recordClip } from './clip-recorder.ts';
import { frameTimeMs } from './clip-timeline.ts';

const WEBM: ClipType = {
  mimeType: 'video/webm;codecs=vp9',
  container: 'video/webm',
  extension: 'webm',
};

/** A recorder that keeps its state the way the real one does, and records one chunk. */
class FakeRecorder extends EventTarget {
  static last: FakeRecorder | null = null;
  /** Set to make the next recorder refuse the stream, as for a type the browser can't record. */
  static refuses = false;
  /** Set to hand back an empty recording, as an encoder starved of time can. */
  static recordsNothing = false;
  state: RecordingState = 'inactive';
  readonly options: MediaRecorderOptions;

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    super();
    if (FakeRecorder.refuses) {
      throw new DOMException('Unsupported', 'NotSupportedError');
    }
    this.options = options;
    FakeRecorder.last = this;
  }

  start() {
    this.state = 'recording';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    const data = new Event('dataavailable');
    Object.defineProperty(data, 'data', {
      value: new Blob(FakeRecorder.recordsNothing ? [] : ['frames']),
    });
    this.dispatchEvent(data);
    this.dispatchEvent(new Event('stop'));
  }
}

let clock = 0;
let callbacks = new Map<number, FrameRequestCallback>();
let nextRequest = 1;
const track = { stop: vi.fn() };
const captureStream = vi.fn(() => ({ getTracks: () => [track] }));
const canvas = { captureStream } as unknown as HTMLCanvasElement;

/** Runs the animation frame the page would draw at `now`. */
function frameAt(now: number) {
  clock = now;
  const pending = [...callbacks.values()];
  callbacks = new Map();
  for (const callback of pending) {
    callback(now);
  }
}

function setHidden(hidden: boolean, now: number) {
  clock = now;
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function record(durationMs = 200) {
  const paint = vi.fn<(timeMs: number) => void>();
  const onProgress = vi.fn<(share: number) => void>();
  const recording = recordClip({ canvas, type: WEBM, durationMs, paint, onProgress });
  const recorder = FakeRecorder.last;
  if (!recorder) {
    throw new Error('No recorder was made.');
  }
  return { recording, recorder, paint, onProgress };
}

beforeEach(() => {
  clock = 1000;
  callbacks = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRequest;
    nextRequest += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    callbacks.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'hidden');
  track.stop.mockClear();
  FakeRecorder.last = null;
  FakeRecorder.refuses = false;
  FakeRecorder.recordsNothing = false;
});

describe('recordClip', () => {
  it('draws every frame once, in order, then hands over the recording', async () => {
    const { recording, recorder, paint, onProgress } = record(200);
    expect(captureStream).toHaveBeenCalledWith(30);
    expect(recorder.options).toEqual({
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5_000_000,
    });
    expect(recorder.state).toBe('recording');
    // A display faster than the clip: frames are drawn on their turn, not on every refresh.
    for (let now = 1008; now < 1300 && callbacks.size > 0; now += 8) {
      frameAt(now);
    }
    expect(paint.mock.calls.map(([time]) => time)).toEqual(
      [0, 1, 2, 3, 4, 5].map((frame) => frameTimeMs(frame)),
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, 0);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    const blob = await recording.result;
    expect(blob?.type).toBe('video/webm');
    expect(blob?.size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalled();
  });

  it('pauses while the page is hidden, and goes on from the same frame', () => {
    const { recorder, paint } = record(2000);
    frameAt(1040);
    expect(paint).toHaveBeenLastCalledWith(frameTimeMs(1));
    setHidden(true, 1050);
    expect(recorder.state).toBe('paused');
    expect(callbacks.size).toBe(0);
    setHidden(false, 9050);
    expect(recorder.state).toBe('recording');
    frameAt(9070);
    // 70 ms of the clip have played, not eight seconds.
    expect(paint).toHaveBeenLastCalledWith(frameTimeMs(2));
  });

  it('is nothing once cancelled, and draws no more', async () => {
    const { recording, recorder, paint } = record();
    frameAt(1040);
    recording.cancel();
    recording.cancel();
    expect(recorder.state).toBe('inactive');
    frameAt(1100);
    expect(paint).toHaveBeenCalledTimes(2);
    expect(await recording.result).toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it('ignores the page coming back when it was not recording', () => {
    const { recorder } = record();
    recorder.state = 'paused';
    setHidden(true, 1010);
    setHidden(false, 1020);
    expect(recorder.state).toBe('paused');
  });

  it('fails rather than hand over a recording with nothing in it', async () => {
    FakeRecorder.recordsNothing = true;
    const { recording } = record(100);
    for (let now = 1040; callbacks.size > 0; now += 40) {
      frameAt(now);
    }
    await expect(recording.result).rejects.toThrow(/recorded nothing/);
  });

  it('fails when the recorder does', async () => {
    const { recording, recorder } = record();
    recorder.dispatchEvent(new Event('error'));
    await expect(recording.result).rejects.toThrow(/could not be recorded/);
    expect(track.stop).toHaveBeenCalled();
  });

  it('lets go of the stream when no recorder can be made for it', () => {
    FakeRecorder.refuses = true;
    expect(() =>
      recordClip({ canvas, type: WEBM, durationMs: 200, paint: vi.fn(), onProgress: vi.fn() }),
    ).toThrow(/Unsupported/);
    expect(track.stop).toHaveBeenCalled();
  });

  it('lets go of the stream when the recorder won’t start', () => {
    vi.spyOn(FakeRecorder.prototype, 'start').mockImplementation(() => {
      throw new DOMException('Busy', 'InvalidStateError');
    });
    expect(() => record()).toThrow(/Busy/);
    expect(track.stop).toHaveBeenCalled();
  });
});
