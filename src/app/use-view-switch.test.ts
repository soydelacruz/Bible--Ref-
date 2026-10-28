import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { versePassage } from '../core/bible/passage.ts';
import { CROSSFADE_MS, KEYBOARD_FADE_MS } from './switch-plan.ts';
import { useViewSwitch, type SwitchRequest } from './use-view-switch.ts';
import { runViewSwitch } from './view-switch.ts';

vi.mock('./view-switch.ts', () => ({ runViewSwitch: vi.fn() }));

const REQUEST: SwitchRequest = {
  update: () => undefined,
  from: null,
  to: null,
  carried: { passage: versePassage(26_136), label: 'John 3:16' },
};

/** The style the last switch was shown with. */
function lastStyle() {
  return vi.mocked(runViewSwitch).mock.lastCall?.[0].style;
}

function withViewTransitions(): void {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn() });
}

function preferReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce'), media: query })),
  );
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.unstubAllGlobals();
  vi.mocked(runViewSwitch).mockClear();
});

describe('useViewSwitch', () => {
  it('carries the passage across a switch made with a pointer', () => {
    withViewTransitions();
    preferReducedMotion(false);
    const { result } = renderHook(useViewSwitch);
    window.dispatchEvent(new Event('pointerdown'));
    result.current(REQUEST);
    expect(runViewSwitch).toHaveBeenCalledWith({
      ...REQUEST,
      style: { kind: 'transition', fadeMs: CROSSFADE_MS, beacon: true },
    });
  });

  it('switches near-instantly after a key, until the pointer is used again', () => {
    withViewTransitions();
    preferReducedMotion(false);
    const { result } = renderHook(useViewSwitch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    result.current(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: KEYBOARD_FADE_MS, beacon: false });

    window.dispatchEvent(new Event('pointerdown'));
    result.current(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: true });
  });

  it('does not count a modifier pressed alone as the keyboard', () => {
    withViewTransitions();
    preferReducedMotion(false);
    const { result } = renderHook(useViewSwitch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    result.current(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: true });
  });

  it('only crossfades with no passage to carry, or for a reader who asked for less motion', () => {
    withViewTransitions();
    preferReducedMotion(false);
    const { result } = renderHook(useViewSwitch);
    result.current({ ...REQUEST, carried: null });
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: false });

    preferReducedMotion(true);
    result.current(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: false });
  });

  it('fades the views where the browser has no view transitions', () => {
    preferReducedMotion(false);
    const { result } = renderHook(useViewSwitch);
    result.current(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'fade', fadeMs: CROSSFADE_MS });
  });

  it('stops listening for input once unmounted', () => {
    withViewTransitions();
    preferReducedMotion(false);
    const { result, unmount } = renderHook(useViewSwitch);
    const switchView = result.current;
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    switchView(REQUEST);
    expect(lastStyle()).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: true });
  });
});
