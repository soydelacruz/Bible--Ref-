import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sheetRoom, useElementSize, useSteadySize } from './use-element-size.ts';

let observers: { element: Element; callback: ResizeObserverCallback; disconnected: boolean }[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(element: Element) {
        observers.push({ element, callback: this.#callback, disconnected: false });
      }
      disconnect() {
        for (const entry of observers) {
          entry.disconnected = true;
        }
      }
      unobserve() {
        // Nothing to undo: the fake never subscribes to anything.
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function resizeTo(width: number, height: number): void {
  const observer = observers.at(-1);
  act(() => {
    observer?.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

describe('useElementSize', () => {
  it('starts at nothing, before the element has been measured', () => {
    const ref = createRef<HTMLElement>();
    expect(renderHook(() => useElementSize(ref)).result.current).toEqual({
      width: 0,
      height: 0,
    });
  });

  it('observes nothing when there is no element yet', () => {
    const ref = createRef<HTMLElement>();
    renderHook(() => useElementSize(ref));
    expect(observers).toHaveLength(0);
  });

  it("reports the element's content box", () => {
    const ref = { current: document.createElement('div') };
    const { result } = renderHook(() => useElementSize(ref));
    resizeTo(800, 600);
    expect(result.current).toEqual({ width: 800, height: 600 });
  });

  it('keeps the same object when the size has not changed, so nothing re-renders', () => {
    const ref = { current: document.createElement('div') };
    const { result } = renderHook(() => useElementSize(ref));
    resizeTo(100, 50);
    const first = result.current;
    resizeTo(100, 50);
    expect(result.current).toBe(first);
  });

  it('ignores a notification with no entry', () => {
    const ref = { current: document.createElement('div') };
    const { result } = renderHook(() => useElementSize(ref));
    act(() => {
      observers.at(-1)?.callback([], {} as ResizeObserver);
    });
    expect(result.current).toEqual({ width: 0, height: 0 });
  });

  it('stops observing when it goes away', () => {
    const ref = { current: document.createElement('div') };
    renderHook(() => useElementSize(ref)).unmount();
    expect(observers.at(-1)?.disconnected).toBe(true);
  });
});

/** Gives an element a fixed place on the page: happy-dom lays nothing out. */
function placeAt(element: Element, bottom: number): void {
  element.getBoundingClientRect = () => ({ bottom }) as DOMRect;
}

/**
 * A page as `VizPage` builds it: a body with a `main` stage, and a sheet's room of `room` pixels
 * below it when `sheet` is set.
 */
function page({ sheet, room }: { sheet: boolean; room: number }) {
  const body = document.createElement('div');
  const stage = document.createElement('main');
  const picture = document.createElement('div');
  if (sheet) body.dataset['sheet'] = 'collapsed';
  stage.append(picture);
  body.append(stage);
  document.body.append(body);
  placeAt(stage, 500);
  placeAt(body, 500 + room);
  return { body, picture };
}

describe('sheetRoom', () => {
  it('is the room a phone keeps below the stage for its sheet', () => {
    expect(sheetRoom(page({ sheet: true, room: 300 }).picture)).toBe(300);
  });

  it('is nothing without a sheet, or where the details are a side panel', () => {
    expect(sheetRoom(page({ sheet: false, room: 300 }).picture)).toBe(0);
    expect(sheetRoom(page({ sheet: true, room: 0 }).picture)).toBe(0);
  });

  it('is nothing outside a page', () => {
    expect(sheetRoom(document.createElement('div'))).toBe(0);
  });
});

describe('useSteadySize', () => {
  it('reports the stage as tall as it would be without the sheet, and what the sheet covers', () => {
    const ref = { current: page({ sheet: true, room: 300 }).picture };
    const { result } = renderHook(() => useSteadySize(ref));
    resizeTo(400, 400);
    expect(result.current).toEqual({ width: 400, height: 700, covered: 300 });
  });

  it('reports the stage as it is without a sheet', () => {
    const ref = { current: page({ sheet: false, room: 0 }).picture };
    const { result } = renderHook(() => useSteadySize(ref));
    resizeTo(400, 700);
    expect(result.current).toEqual({ width: 400, height: 700, covered: 0 });
  });

  it('keeps the same object while nothing has changed, the sheet included', () => {
    const { body, picture } = page({ sheet: true, room: 300 });
    const { result } = renderHook(() => useSteadySize({ current: picture }));
    resizeTo(400, 400);
    const first = result.current;
    resizeTo(400, 400);
    expect(result.current).toBe(first);
    // The sheet gone, the stage is as tall as before, and nothing is covered.
    placeAt(body, 500);
    resizeTo(400, 700);
    expect(result.current).toEqual({ width: 400, height: 700, covered: 0 });
  });
});
