import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { versePassage } from '../core/bible/passage.ts';
import { provideLocator, type PassageSpot } from '../visualizations/shared/passage-spot.ts';
import { BEACON_LANDING_MS, runViewSwitch, type ViewSwitch } from './view-switch.ts';

const CARRIED = { passage: versePassage(26_136), label: 'John 3:16' };
const BOUNDS = { left: 0, top: 50, right: 800, bottom: 650 };
const at = (x: number, y: number): PassageSpot => ({ point: { x, y }, bounds: BOUNDS });

/** A switch the test plays step by step: the update when it says, then the end. */
interface FakeTransition {
  readonly update: () => void;
  readonly finish: () => void;
  readonly skipTransition: Mock<() => void>;
}

let transitions: FakeTransition[] = [];
const withdrawals: (() => void)[] = [];

/** Stands in for the View Transitions API, which happy-dom does not have. */
function fakeViewTransitions(): void {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (callback: () => void) => {
      let finish: () => void = () => undefined;
      let settle: (error?: Error) => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const updateCallbackDone = new Promise<void>((resolve, reject) => {
        settle = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      });
      const transition: FakeTransition = {
        update: () => {
          try {
            callback();
            settle();
          } catch (error) {
            settle(error instanceof Error ? error : new Error(String(error)));
          }
        },
        finish,
        skipTransition: vi.fn(finish),
      };
      transitions.push(transition);
      return {
        finished,
        ready: updateCallbackDone,
        updateCallbackDone,
        skipTransition: transition.skipTransition,
      };
    },
  });
}

/** A view whose passage is drawn at `spot`, and the element that holds it. */
function view(spot: () => PassageSpot | null): HTMLElement {
  const root = document.createElement('div');
  const stage = document.createElement('div');
  root.append(stage);
  document.body.append(root);
  withdrawals.push(provideLocator(stage, spot));
  return root;
}

function beacons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-passage-beacon]')];
}

function place(beacon: HTMLElement | undefined): [string, string] | null {
  return beacon ? [beacon.style.left, beacon.style.top] : null;
}

function travelling(overrides: Partial<ViewSwitch> = {}): ViewSwitch {
  return {
    update: vi.fn(),
    style: { kind: 'transition', fadeMs: 180, beacon: true },
    from: view(() => at(100, 600)),
    to: view(() => at(40, 200)),
    carried: CARRIED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  transitions = [];
  fakeViewTransitions();
});

afterEach(async () => {
  // Whatever a test left under way ends, so the next one starts from a still page.
  for (const transition of transitions) transition.finish();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  for (const withdraw of withdrawals.splice(0)) withdraw();
  Reflect.deleteProperty(document, 'startViewTransition');
  document.body.innerHTML = '';
});

describe('runViewSwitch with view transitions', () => {
  it('carries a beacon from the passage in the last view to the passage in the next', async () => {
    const request = travelling();
    runViewSwitch(request);
    // In the picture of the page as it was, before anything changes.
    expect(request.update).not.toHaveBeenCalled();
    expect(beacons().map(place)).toEqual([['100px', '600px']]);
    expect(beacons()[0]?.textContent).toBe('John 3:16');
    expect(beacons()[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(document.documentElement.dataset['viewSwitch']).toBe('');
    expect(document.documentElement.style.getPropertyValue('--view-switch-fade')).toBe('180ms');

    transitions[0]?.update();
    expect(request.update).toHaveBeenCalledOnce();
    expect(beacons().map(place)).toEqual([['40px', '200px']]);
    // Near the left edge, its name leans away from it.
    expect(beacons()[0]?.dataset['align']).toBe('start');

    transitions[0]?.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.dataset['viewSwitch']).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--view-switch-fade')).toBe('');
    expect(beacons()[0]?.dataset['landed']).toBe('');
    await vi.advanceTimersByTimeAsync(BEACON_LANDING_MS);
    expect(beacons()).toEqual([]);
  });

  it('centers the name over the dot away from the sides of the screen', () => {
    runViewSwitch(travelling({ to: view(() => at(400, 300)) }));
    transitions[0]?.update();
    expect(beacons()[0]?.dataset['align']).toBe('center');
  });

  it('appears where the passage is when the last view did not draw it', () => {
    runViewSwitch(travelling({ from: view(() => null) }));
    expect(beacons()).toEqual([]);
    transitions[0]?.update();
    expect(beacons().map(place)).toEqual([['40px', '200px']]);
  });

  it('takes the beacon away, leaving no trace, when there is nowhere to point', () => {
    runViewSwitch(travelling({ to: view(() => null) }));
    expect(beacons()).toHaveLength(1);
    transitions[0]?.update();
    expect(beacons()).toEqual([]);
    expect(document.documentElement.dataset['viewSwitch']).toBe('plain');
  });

  it('only crossfades when no beacon goes along', async () => {
    const request = travelling({
      style: { kind: 'transition', fadeMs: 100, beacon: false },
    });
    runViewSwitch(request);
    expect(beacons()).toEqual([]);
    expect(document.documentElement.style.getPropertyValue('--view-switch-fade')).toBe('100ms');
    transitions[0]?.update();
    expect(request.update).toHaveBeenCalledOnce();
    expect(beacons()).toEqual([]);
    transitions[0]?.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.dataset['viewSwitch']).toBeUndefined();
  });

  it('ends a switch under way when the next one begins', async () => {
    runViewSwitch(travelling());
    const second = travelling();
    runViewSwitch(second);
    expect(transitions[0]?.skipTransition).toHaveBeenCalledOnce();
    // One beacon: two with the same name would stop the browser from animating either.
    expect(beacons()).toHaveLength(1);
    // The first one's update still runs, and puts no beacon of its own back.
    transitions[0]?.update();
    expect(beacons()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    // Its ending leaves the second one's settings alone.
    expect(document.documentElement.dataset['viewSwitch']).toBe('');
    transitions[1]?.update();
    expect(second.update).toHaveBeenCalledOnce();
  });

  it('reports an update that fails, rather than losing it', async () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    const failure = new Error('no view');
    runViewSwitch(
      travelling({
        update: () => {
          throw failure;
        },
      }),
    );
    transitions[0]?.update();
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledWith(failure);
    vi.unstubAllGlobals();
  });
});

describe('runViewSwitch without view transitions', () => {
  it('fades the next view in over the last, then lets the last one go', async () => {
    const from = view(() => at(100, 600));
    const to = view(() => at(40, 200));
    const update = vi.fn(() => {
      // By the time the update runs, the last view is held on screen under the next.
      expect(from.hasAttribute('data-leaving')).toBe(true);
    });
    runViewSwitch({ update, style: { kind: 'fade', fadeMs: 180 }, from, to, carried: CARRIED });
    expect(update).toHaveBeenCalledOnce();
    expect(to.hasAttribute('data-entering')).toBe(true);
    expect(to.style.getPropertyValue('--view-fade')).toBe('180ms');
    expect(beacons()).toEqual([]);
    expect(transitions).toEqual([]);

    await vi.advanceTimersByTimeAsync(180);
    expect(from.hasAttribute('data-leaving')).toBe(false);
    expect(to.hasAttribute('data-entering')).toBe(false);
  });

  it('lets the last fade go at once when another switch begins', () => {
    const from = view(() => null);
    const to = view(() => null);
    runViewSwitch({
      update: vi.fn(),
      style: { kind: 'fade', fadeMs: 180 },
      from,
      to,
      carried: null,
    });
    runViewSwitch({
      update: vi.fn(),
      style: { kind: 'fade', fadeMs: 180 },
      from: to,
      to: from,
      carried: null,
    });
    expect(to.hasAttribute('data-entering')).toBe(false);
    expect(from.hasAttribute('data-entering')).toBe(true);
  });
});
