import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  animate,
  easeInOutCubic,
  easeOutCubic,
  FrameScheduler,
  MAX_FRAME_MS,
  MAX_PIXEL_RATIO,
  prefersReducedMotion,
  simulate,
} from './frames.ts';

let frames: (() => void)[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(() => {
      cb(performance.now());
    });
    return frames.length; // 1-based, so no handle is ever 0
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function runFrames(): void {
  const pending = frames;
  frames = [];
  for (const frame of pending) {
    frame();
  }
}

describe('MAX_PIXEL_RATIO', () => {
  it('stops at a ratio worth rendering', () => {
    expect(MAX_PIXEL_RATIO).toBe(2);
  });
});

describe('FrameScheduler', () => {
  it('draws once however many times it is asked within a frame', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(render).not.toHaveBeenCalled();
    runFrames();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('draws again once the frame it asked for has passed', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.request();
    runFrames();
    scheduler.request();
    runFrames();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('does not draw after it is disposed', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.request();
    scheduler.dispose();
    runFrames();
    expect(render).not.toHaveBeenCalled();
  });

  it('can be disposed when nothing is pending', () => {
    const scheduler = new FrameScheduler(vi.fn());
    expect(() => {
      scheduler.dispose();
    }).not.toThrow();
  });
});

describe('animate', () => {
  it('eases out and finishes at exactly 1', () => {
    const seen: number[] = [];
    animate(0, (progress) => seen.push(progress));
    runFrames();
    expect(seen.at(-1)).toBe(1);
  });

  it('keeps asking for frames until the time is up', () => {
    const seen: number[] = [];
    animate(10_000, (progress) => seen.push(progress));
    runFrames();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeLessThan(1);
    runFrames(); // it asked for another
    expect(seen.length).toBeGreaterThan(1);
  });

  it('eases rather than running linearly', () => {
    // Half way through a 100ms animation, an ease-out curve is already past half.
    const seen: number[] = [];
    let now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    const captured: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => captured.push(cb));
    animate(100, (progress) => seen.push(progress));
    now = 1050;
    captured[0]?.(now);
    expect(seen[0]).toBeCloseTo(1 - 0.5 ** 3, 5);
    expect(seen[0]).toBeGreaterThan(0.5);
  });

  it('stops when cancelled', () => {
    const onFrame = vi.fn();
    const cancel = animate(10_000, onFrame);
    cancel();
    runFrames();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('takes another curve when given one', () => {
    const seen: number[] = [];
    animate(0, (progress) => seen.push(progress), easeInOutCubic);
    runFrames();
    expect(seen).toEqual([1]);
  });
});

describe('easing', () => {
  it('starts at 0 and lands on 1', () => {
    for (const ease of [easeOutCubic, easeInOutCubic]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  it('eases out fast first, and in and out symmetrically', () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.5);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
  });
});

describe('simulate', () => {
  it('hands each step the time since the last, until the step says it is done', () => {
    let now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    const captured: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => captured.push(cb));
    const seen: number[] = [];
    simulate((elapsed) => {
      seen.push(elapsed);
      return seen.length < 2;
    });
    now = 1016;
    captured[0]?.(now);
    now = 1040;
    captured[1]?.(now);
    expect(seen).toEqual([16, 24]);
    expect(captured).toHaveLength(2); // The second step was the last: no third frame.
  });

  it('caps a stalled frame, so motion never jumps', () => {
    let now = 0;
    vi.stubGlobal('performance', { now: () => now });
    const captured: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => captured.push(cb));
    const seen: number[] = [];
    simulate((elapsed) => seen.push(elapsed) < 0);
    now = 5000;
    captured[0]?.(now);
    expect(seen).toEqual([MAX_FRAME_MS]);
  });

  it('stops when cancelled', () => {
    const step = vi.fn(() => true);
    const cancel = simulate(step);
    cancel();
    runFrames();
    expect(step).not.toHaveBeenCalled();
  });
});

describe('prefersReducedMotion', () => {
  it('follows the reader’s setting', () => {
    let reduce = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
    }));
    expect(prefersReducedMotion()).toBe(false);
    reduce = true;
    expect(prefersReducedMotion()).toBe(true);
  });
});
