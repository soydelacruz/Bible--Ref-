import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_GRACE_MS,
  IDLE_FALLBACK_MS,
  IDLE_TIMEOUT_MS,
  SETTLE_ROUNDS,
  useViewOpening,
} from './use-view-opening.ts';

type Id = 'arcs' | 'threads' | 'clusters';

/** A view's code that arrives when `arrive` is called, or fails when `fail` is. */
function pendingCode() {
  let arrive: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const code = new Promise<void>((resolve, reject) => {
    arrive = resolve;
    fail = reject;
  });
  return { code, arrive, fail };
}

/** Lets the promises settled so far run their reactions. */
async function settlePromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Draws `rounds` frames, each followed by a quiet moment, as a newly mounted view settles. */
function settle(rounds: number): void {
  act(() => {
    for (let round = 0; round < rounds; round += 1) {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersByTime(IDLE_FALLBACK_MS);
    }
  });
}

function setup(load: (id: Id) => Promise<unknown> = () => Promise.resolve()) {
  const loader = vi.fn(load);
  const hook = renderHook(() => useViewOpening<Id>(loader));
  return { ...hook, loader };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'hidden');
});

describe('useViewOpening', () => {
  it('shows a view that has mounted and settled at once, and keeps it mounted', () => {
    const { result, loader } = setup();
    act(() => {
      result.current.onMounted('arcs', true);
    });
    expect(result.current.opened.has('arcs')).toBe(true);
    settle(SETTLE_ROUNDS);

    const show = vi.fn();
    result.current.whenOpen('arcs', show);
    expect(show).toHaveBeenCalledOnce();
    expect(loader).not.toHaveBeenCalled();
  });

  it('mounts a view the first time it is opened, and shows it once it has settled', async () => {
    const { result, loader } = setup();
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('threads', show);
    });
    expect(loader).toHaveBeenCalledWith('threads');
    expect(result.current.opened.has('threads')).toBe(true);
    await settlePromises();

    act(() => {
      result.current.onMounted('threads', true);
    });
    settle(SETTLE_ROUNDS - 1);
    expect(show).not.toHaveBeenCalled();
    settle(1);
    expect(show).toHaveBeenCalledOnce();

    // Opened now: a second switch to it does not wait.
    const again = vi.fn();
    result.current.whenOpen('threads', again);
    expect(again).toHaveBeenCalledOnce();
  });

  it('waits past the grace for a view whose code is here, until it has settled', async () => {
    const { result } = setup();
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('clusters', show);
    });
    await settlePromises();
    act(() => {
      vi.advanceTimersByTime(CODE_GRACE_MS * 4);
    });
    expect(show).not.toHaveBeenCalled();

    act(() => {
      result.current.onMounted('clusters', true);
    });
    settle(SETTLE_ROUNDS);
    expect(show).toHaveBeenCalledOnce();
  });

  it('shows the view, to load in place, once its code has kept the reader waiting', () => {
    const { code } = pendingCode();
    const { result } = setup(() => code);
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('arcs', show);
    });
    act(() => {
      vi.advanceTimersByTime(CODE_GRACE_MS - 1);
    });
    expect(show).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(show).toHaveBeenCalledOnce();

    // And only once, when the view arrives and settles after all.
    act(() => {
      result.current.onMounted('arcs', true);
    });
    settle(SETTLE_ROUNDS);
    expect(show).toHaveBeenCalledOnce();
  });

  it('shows a view whose code fails to arrive at once, for its frame to say so', async () => {
    const { code, fail } = pendingCode();
    const { result } = setup(() => code);
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('threads', show);
    });
    fail(new Error('offline'));
    await settlePromises();
    expect(show).toHaveBeenCalledOnce();
  });

  it('lets a later request take the place of one still waiting', async () => {
    const { result } = setup();
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      result.current.whenOpen('threads', first);
      result.current.whenOpen('clusters', second);
    });
    await settlePromises();
    expect(result.current.opened).toEqual(new Set(['threads', 'clusters']));
    act(() => {
      result.current.onMounted('threads', true);
      result.current.onMounted('clusters', true);
    });
    settle(SETTLE_ROUNDS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('waits again for a view that has been mounted afresh', () => {
    const { result } = setup();
    act(() => {
      result.current.onMounted('arcs', true);
    });
    settle(SETTLE_ROUNDS);
    act(() => {
      result.current.onMounted('arcs', false);
      result.current.onMounted('arcs', true);
    });
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('arcs', show);
    });
    expect(show).not.toHaveBeenCalled();
    settle(SETTLE_ROUNDS);
    expect(show).toHaveBeenCalledOnce();
  });

  it('waits for the work a frame sets off, not only for the frame', () => {
    // Where the browser can say when it has nothing left to do.
    const idle = vi.fn((callback: () => void) => setTimeout(callback, 5));
    vi.stubGlobal('requestIdleCallback', idle);
    vi.stubGlobal('cancelIdleCallback', (request: number) => {
      clearTimeout(request);
    });
    const { result } = setup();
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('arcs', show);
      result.current.onMounted('arcs', true);
    });
    act(() => {
      for (let round = 0; round < SETTLE_ROUNDS; round += 1) vi.advanceTimersToNextFrame();
    });
    expect(show).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS });

    act(() => {
      for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        vi.advanceTimersByTime(5);
        vi.advanceTimersToNextFrame();
      }
    });
    expect(show).toHaveBeenCalledOnce();

    // And a view that goes while waiting for its quiet moment is called off.
    act(() => {
      result.current.onMounted('clusters', true);
    });
    act(() => {
      vi.advanceTimersToNextFrame();
      result.current.onMounted('clusters', false);
    });
    const never = vi.fn();
    act(() => {
      result.current.whenOpen('clusters', never);
    });
    act(() => {
      vi.advanceTimersByTime(CODE_GRACE_MS - 1);
    });
    expect(never).not.toHaveBeenCalled();
  });

  it('does not count a view that went while it settled', () => {
    const { result } = setup();
    act(() => {
      // Gone before it was drawn…
      result.current.onMounted('threads', true);
      result.current.onMounted('threads', false);
      result.current.onMounted('clusters', true);
    });
    // …and once it had been, before the quiet moment after.
    act(() => {
      vi.advanceTimersToNextFrame();
      result.current.onMounted('clusters', false);
    });
    settle(SETTLE_ROUNDS);
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('threads', show);
      result.current.whenOpen('clusters', show);
    });
    expect(show).not.toHaveBeenCalled();
  });

  it('does not wait for frames on a page out of sight, which draws none', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const { result } = setup();
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('clusters', show);
      result.current.onMounted('clusters', true);
    });
    expect(show).toHaveBeenCalledOnce();
  });

  it('calls everything off when the host goes', async () => {
    const { code } = pendingCode();
    const { result, unmount } = setup(() => code);
    const show = vi.fn();
    act(() => {
      result.current.whenOpen('threads', show);
      result.current.onMounted('arcs', true);
    });
    await settlePromises();
    // Mid-way through settling: drawn, and waiting for a quiet moment.
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    unmount();
    vi.advanceTimersByTime(CODE_GRACE_MS);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(show).not.toHaveBeenCalled();
  });
});
