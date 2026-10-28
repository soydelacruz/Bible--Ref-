import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathStep } from './connection-path.ts';
import {
  HOP_MS,
  hopFrame,
  isLit,
  litStepAt,
  PathLight,
  pathDuration,
  pathMode,
  PathRun,
  RESTING_HOP,
  type LitSteps,
  type PathFrames,
  type PathMode,
  type PathPlayer,
} from './path-light.ts';

/** The loading screen's landing flash, which the last hop ends with. */
const LANDING_MS = 700;

const CHAIN: readonly PathStep[] = [
  { verse: 10, hop: null },
  { verse: 20, hop: { linkId: 1, votes: 5, direction: 'outgoing' } },
  { verse: 30, hop: { linkId: 2, votes: 3, direction: 'incoming' } },
];

describe('hopFrame', () => {
  it('sets each hop off as the one before lands', () => {
    expect(hopFrame(1, HOP_MS - 1)).toBeNull();
    expect(hopFrame(1, HOP_MS)?.head).toBe(0);
    expect(hopFrame(0, HOP_MS)?.head).toBe(1);
    expect(hopFrame(0, HOP_MS)?.landing).toBe(1);
  });

  it('keeps the trace once the light has passed, so the chain can be read', () => {
    const passed = hopFrame(0, HOP_MS * 2);
    expect(passed?.light).toBe(0);
    expect(passed?.trace).toBe(1);
    expect(hopFrame(0, 60_000)).toEqual(RESTING_HOP);
    expect(hopFrame(3, Infinity)).toEqual(RESTING_HOP);
  });
});

describe('pathDuration', () => {
  it('lasts until the last hop has landed and its flash has faded', () => {
    expect(pathDuration(1)).toBe(HOP_MS + LANDING_MS);
    expect(pathDuration(4)).toBe(4 * HOP_MS + LANDING_MS);
    expect(pathDuration(0)).toBe(0);
  });
});

describe('litStepAt', () => {
  it('lights the step a hop is heading for while it travels, one after another', () => {
    expect(litStepAt(3, 0)).toEqual({ first: 1, last: 1 });
    expect(litStepAt(3, HOP_MS - 1)).toEqual({ first: 1, last: 1 });
    expect(litStepAt(3, HOP_MS)).toEqual({ first: 2, last: 2 });
    expect(litStepAt(3, 3 * HOP_MS - 1)).toEqual({ first: 3, last: 3 });
  });

  it('lights nothing before the light sets off or once it has landed', () => {
    expect(litStepAt(3, -1)).toBeNull();
    expect(litStepAt(3, 3 * HOP_MS)).toBeNull();
  });
});

describe('isLit', () => {
  it('covers the steps between both ends', () => {
    const lit = { first: 0, last: 2 };
    expect([0, 1, 2, 3].map((step) => isLit(lit, step))).toEqual([true, true, true, false]);
    expect(isLit(null, 0)).toBe(false);
  });
});

describe('pathMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('travels, holds still for less motion, and lands at once out of sight', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(pathMode(true)).toBe('travel');
    expect(pathMode(false)).toBe('instant');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(pathMode(true)).toBe('still');
  });
});

describe('PathRun', () => {
  let frames: FrameRequestCallback[] = [];
  let now = 0;

  beforeEach(() => {
    frames = [];
    now = 0;
    vi.useFakeTimers();
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Runs the frames due, as the browser would at `time`. */
  function frameAt(time: number): void {
    now = time;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(time);
  }

  /** Frames every 16ms from `from` up to and including `to`. */
  function framesUntil(from: number, to: number): void {
    for (let time = from; time <= to; time += 16) frameAt(time);
  }

  function record(hops: number, mode: PathMode) {
    const painted: PathFrames[] = [];
    const lit: (LitSteps | null)[] = [];
    const run = new PathRun(
      hops,
      mode,
      (shown) => painted.push(shown),
      (steps) => lit.push(steps),
    );
    return { run, painted, lit };
  }

  it('travels hop by hop, lighting each step as its hop travels, then lands', async () => {
    const { run, painted, lit } = record(2, 'travel');
    // The first frame is painted at once: nothing has set off yet.
    expect(painted).toHaveLength(1);
    expect(painted[0]?.[1]).toBeNull();
    expect(lit).toEqual([{ first: 1, last: 1 }]);

    framesUntil(16, HOP_MS - 10);
    expect(lit).toEqual([{ first: 1, last: 1 }]);
    frameAt(HOP_MS + 6);
    expect(lit.at(-1)).toEqual({ first: 2, last: 2 });
    expect(painted.at(-1)?.[1]).not.toBeNull();

    framesUntil(HOP_MS + 22, pathDuration(2) + 16);
    expect(lit).toEqual([{ first: 1, last: 1 }, { first: 2, last: 2 }, null]);
    expect(frames).toHaveLength(0);
    await expect(run.done).resolves.toBe(true);
    expect(painted.at(-1)).toEqual([RESTING_HOP, RESTING_HOP]);
  });

  it('counts a stalled frame as a short step, so no step is skipped', () => {
    const { lit } = record(3, 'travel');
    frameAt(5000);
    expect(lit).toEqual([{ first: 1, last: 1 }]);
    framesUntil(5016, 5000 + pathDuration(3) + 16);
    expect(lit).toEqual([
      { first: 1, last: 1 },
      { first: 2, last: 2 },
      { first: 3, last: 3 },
      null,
    ]);
  });

  it('draws the whole chain at once with every step lit, for as long, with less motion', async () => {
    const { run, painted, lit } = record(3, 'still');
    expect(painted).toEqual([[RESTING_HOP, RESTING_HOP, RESTING_HOP]]);
    expect(lit).toEqual([{ first: 0, last: 3 }]);
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(pathDuration(3) - 1);
    expect(lit).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(lit.at(-1)).toBeNull();
    await expect(run.done).resolves.toBe(true);
  });

  it('out of sight, is drawn whole and done at once, lighting nothing', async () => {
    const { run, painted, lit } = record(2, 'instant');
    expect(painted).toEqual([[RESTING_HOP, RESTING_HOP]]);
    expect(lit).toEqual([]);
    await expect(run.done).resolves.toBe(true);
  });

  it('stops where it is when cancelled, and says it did not play', async () => {
    const { run, painted, lit } = record(2, 'travel');
    run.cancel();
    frameAt(16);
    expect(painted).toHaveLength(1);
    expect(lit.at(-1)).toBeNull();
    await expect(run.done).resolves.toBe(false);
    run.finish();
    expect(painted).toHaveLength(1);
  });

  it('lands at once when asked to finish, drawn whole', async () => {
    const { run, painted, lit } = record(2, 'travel');
    run.finish();
    expect(painted.at(-1)).toEqual([RESTING_HOP, RESTING_HOP]);
    expect(lit.at(-1)).toBeNull();
    expect(run.frames()).toEqual([RESTING_HOP, RESTING_HOP]);
    await expect(run.done).resolves.toBe(true);
  });

  it('stops holding still when cancelled', async () => {
    const { run, lit } = record(1, 'still');
    run.cancel();
    vi.advanceTimersByTime(pathDuration(1));
    expect(lit).toEqual([{ first: 0, last: 1 }, null]);
    await expect(run.done).resolves.toBe(false);
  });
});

describe('PathLight', () => {
  interface Play {
    readonly steps: readonly PathStep[];
    readonly signal: AbortSignal;
    readonly onLit: (lit: LitSteps | null) => void;
  }

  function attachPlayer(light: PathLight) {
    const plays: Play[] = [];
    const player: PathPlayer = (steps, { signal, onLit }) => {
      plays.push({ steps, signal, onLit });
      return Promise.resolve(true);
    };
    const detach = light.attach(player);
    return { plays, detach };
  }

  it('plays a chain once when it appears', () => {
    const light = new PathLight();
    const { plays } = attachPlayer(light);
    light.show(CHAIN);
    expect(plays.map((play) => play.steps)).toEqual([CHAIN]);
    // Found again (another render, a filter that changes nothing on it): it does not play again.
    light.show(CHAIN.map((step) => ({ ...step })));
    expect(plays).toHaveLength(1);
  });

  it('takes the chain off the picture when another one comes, or none', () => {
    const light = new PathLight();
    const { plays } = attachPlayer(light);
    light.show(CHAIN);
    light.show(CHAIN.slice(1));
    expect(plays[0]?.signal.aborted).toBe(true);
    expect(plays[1]?.signal.aborted).toBe(false);
    light.show(null);
    expect(plays[1]?.signal.aborted).toBe(true);
    expect(plays).toHaveLength(2);
  });

  it('plays the chain again from its start', () => {
    const light = new PathLight();
    const { plays } = attachPlayer(light);
    light.replay();
    expect(plays).toHaveLength(0);
    light.show(CHAIN);
    light.replay();
    expect(plays).toHaveLength(2);
    expect(plays[0]?.signal.aborted).toBe(true);
    expect(plays[1]?.steps).toBe(CHAIN);
  });

  it('plays a chain shown before the picture came, and stops when it goes', () => {
    const light = new PathLight();
    light.show(CHAIN);
    const { plays, detach } = attachPlayer(light);
    expect(plays).toHaveLength(1);
    detach();
    expect(plays[0]?.signal.aborted).toBe(true);
    // Letting go twice changes nothing; with no picture, nothing plays.
    detach();
    light.replay();
    expect(plays).toHaveLength(1);
  });

  it('keeps the picture that took over when an earlier one lets go', () => {
    const light = new PathLight();
    const first = attachPlayer(light);
    const second = attachPlayer(light);
    light.show(CHAIN);
    first.detach();
    expect(second.plays[0]?.signal.aborted).toBe(false);
    expect(first.plays).toHaveLength(0);
  });

  it('hands the panel the steps lit by the chain playing now, and no other', () => {
    const light = new PathLight();
    const { plays } = attachPlayer(light);
    const listener = vi.fn();
    const unsubscribe = light.subscribe(listener);
    light.show(CHAIN);
    const lit = { first: 1, last: 1 };
    plays[0]?.onLit(lit);
    expect(light.lit()).toBe(lit);
    expect(listener).toHaveBeenCalledTimes(1);
    plays[0]?.onLit(lit);
    expect(listener).toHaveBeenCalledTimes(1);

    light.show(CHAIN.slice(1));
    expect(light.lit()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    plays[0]?.onLit({ first: 2, last: 2 });
    expect(light.lit()).toBeNull();
    unsubscribe();
    plays[1]?.onLit(lit);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('tells chains apart by their verses and their links', () => {
    const light = new PathLight();
    const { plays } = attachPlayer(light);
    light.show(CHAIN);
    light.show(
      CHAIN.map((step) => (step.hop ? { ...step, hop: { ...step.hop, linkId: 9 } } : step)),
    );
    light.show(CHAIN.map((step) => ({ ...step, verse: step.verse + 1 })));
    light.show(CHAIN.slice(0, 2));
    expect(plays).toHaveLength(4);
  });
});
