import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AT_REST,
  attachGestures,
  HOLD_TO_PREVIEW_MS,
  VelocityTracker,
  wheelZoomFactor,
  type GestureElement,
  type GestureHandlers,
} from './gestures.ts';

describe('VelocityTracker', () => {
  it('measures the latest movements', () => {
    const tracker = new VelocityTracker();
    tracker.reset(0);
    tracker.add(10, 5, 0); // slow at first...
    for (let time = 100; time <= 220; time += 20) {
      tracker.add(time, 40, -20); // ...then fast: 2 and -1 px/ms
    }
    const velocity = tracker.velocity(220);
    expect(velocity.x).toBeCloseTo(2);
    expect(velocity.y).toBeCloseTo(-1);
  });

  it('is at rest before any movement, or once the drag has paused', () => {
    const tracker = new VelocityTracker();
    tracker.reset(0);
    expect(tracker.velocity(0)).toBe(AT_REST);
    tracker.add(16, 30, 0);
    expect(tracker.velocity(16).x).toBeGreaterThan(0);
    expect(tracker.velocity(200)).toBe(AT_REST);
  });

  it('counts a start after a long hold from the moment it moved, not from the press', () => {
    const tracker = new VelocityTracker();
    tracker.reset(0);
    tracker.add(2000, 50, 0);
    expect(tracker.velocity(2000).x).toBeCloseTo(1);
  });

  it('is at rest when the movements took no time', () => {
    const tracker = new VelocityTracker();
    tracker.reset(5);
    tracker.add(5, 10, 0);
    expect(tracker.velocity(5)).toBe(AT_REST);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelZoomFactor(0, 0, false)).toBe(1);
  });

  it('is symmetric, so zooming in and back out restores the scale', () => {
    expect(wheelZoomFactor(-50, 0, false) * wheelZoomFactor(50, 0, false)).toBeCloseTo(1);
  });

  it('normalizes line-based deltas and treats trackpad pinches as stronger', () => {
    expect(wheelZoomFactor(1, 1, false)).toBeCloseTo(wheelZoomFactor(16, 0, false));
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false));
  });
});

/** A stand-in for the element: it dispatches events and sits at the page's origin. */
class Surface extends EventTarget implements GestureElement {
  setPointerCapture(): void {
    // Nothing to capture: every event is dispatched to this surface directly.
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    };
  }
}

describe('attachGestures, with a finger', () => {
  const createHandlers = () => ({
    onPan: vi.fn<NonNullable<GestureHandlers['onPan']>>(),
    onZoom: vi.fn<NonNullable<GestureHandlers['onZoom']>>(),
    onHover: vi.fn<NonNullable<GestureHandlers['onHover']>>(),
    onLeave: vi.fn<NonNullable<GestureHandlers['onLeave']>>(),
    previewsAt: vi.fn<NonNullable<GestureHandlers['previewsAt']>>(() => false),
    onTap: vi.fn<NonNullable<GestureHandlers['onTap']>>(),
    onDoubleTap: vi.fn<NonNullable<GestureHandlers['onDoubleTap']>>(),
    onGrab: vi.fn<NonNullable<GestureHandlers['onGrab']>>(),
    onRelease: vi.fn<NonNullable<GestureHandlers['onRelease']>>(),
  });
  let surface: Surface;
  let handlers: ReturnType<typeof createHandlers>;
  let detach: () => void;

  const send = (type: string, id: number, x: number, y: number, pointerType = 'touch') => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: id,
      pointerType,
      clientX: x,
      clientY: y,
      button: 0,
    });
    surface.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    surface = new Surface();
    handlers = createHandlers();
    detach = attachGestures(surface, handlers);
  });

  afterEach(() => {
    detach();
    vi.useRealTimers();
  });

  it('previews after a hold, scrubs as the finger slides, and ends without selecting', () => {
    send('pointerdown', 1, 100, 100);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS - 1);
    expect(handlers.onHover).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handlers.onHover).toHaveBeenLastCalledWith({ x: 100, y: 100 }, 'touch');

    send('pointermove', 1, 100, 160);
    expect(handlers.onHover).toHaveBeenLastCalledWith({ x: 100, y: 160 }, 'touch');
    expect(handlers.onPan).not.toHaveBeenCalled();

    send('pointerup', 1, 100, 160);
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('pans when the finger moves before the hold, and never previews then', () => {
    send('pointerdown', 1, 100, 100);
    send('pointermove', 1, 100, 120);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS * 2);
    send('pointermove', 1, 100, 130);
    send('pointerup', 1, 100, 130);
    expect(handlers.onPan).toHaveBeenCalledTimes(2);
    expect(handlers.onHover).not.toHaveBeenCalled();
    expect(handlers.onLeave).not.toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('taps when lifted before the hold; once the preview shows, lifting only ends it', () => {
    send('pointerdown', 1, 50, 50);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS - 1);
    send('pointerup', 1, 50, 50);
    expect(handlers.onHover).not.toHaveBeenCalled();
    expect(handlers.onTap).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1000); // Well apart, so the next one is not a double tap.
    send('pointerdown', 1, 50, 50);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS);
    send('pointerup', 1, 50, 50);
    expect(handlers.onHover).toHaveBeenCalledOnce();
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    expect(handlers.onTap).toHaveBeenCalledOnce();
  });

  it('taps where a finger previews at once, when it lifts quickly without moving', () => {
    handlers.previewsAt.mockReturnValue(true);
    send('pointerdown', 1, 10, 300);
    vi.advanceTimersByTime(100);
    send('pointerup', 1, 10, 300);
    expect(handlers.onHover).toHaveBeenCalledOnce();
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    expect(handlers.onTap).toHaveBeenCalledOnce();
  });

  it('only previews, without selecting, when held long', () => {
    send('pointerdown', 1, 50, 50);
    vi.advanceTimersByTime(1000);
    send('pointerup', 1, 50, 50);
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('previews at once where `previewsAt` allows', () => {
    handlers.previewsAt.mockReturnValue(true);
    send('pointerdown', 1, 10, 300);
    expect(handlers.onHover).toHaveBeenCalledWith({ x: 10, y: 300 }, 'touch');
    send('pointermove', 1, 10, 200);
    expect(handlers.onHover).toHaveBeenLastCalledWith({ x: 10, y: 200 }, 'touch');
    expect(handlers.onPan).not.toHaveBeenCalled();
  });

  it('turns into a pinch when a second finger lands, ending any preview', () => {
    send('pointerdown', 1, 100, 100);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS);
    expect(handlers.onHover).toHaveBeenCalledOnce();

    send('pointerdown', 2, 200, 100);
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    send('pointermove', 2, 300, 100);
    expect(handlers.onZoom).toHaveBeenCalledOnce();
    expect(handlers.onZoom.mock.calls[0]?.[0]).toBeCloseTo(2);

    send('pointerup', 2, 300, 100);
    send('pointerup', 1, 100, 100);
    expect(handlers.onHover).toHaveBeenCalledOnce();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('keeps a pending hold from previewing once a pinch has started', () => {
    send('pointerdown', 1, 100, 100);
    send('pointerdown', 2, 200, 100);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS * 2);
    expect(handlers.onHover).not.toHaveBeenCalled();
  });

  it('keeps the mouse to hovering: holding its button never previews', () => {
    send('pointermove', 1, 20, 20, 'mouse');
    expect(handlers.onHover).toHaveBeenLastCalledWith({ x: 20, y: 20 }, 'mouse');
    send('pointerdown', 1, 20, 20, 'mouse');
    vi.advanceTimersByTime(1000);
    send('pointermove', 1, 60, 20, 'mouse');
    expect(handlers.onHover).toHaveBeenCalledOnce();
    expect(handlers.onPan).toHaveBeenCalledOnce();
  });

  it("stops a finger's long press from opening the context menu, but not a right click", () => {
    send('pointerdown', 1, 20, 20);
    const touchMenu = new Event('contextmenu', { cancelable: true });
    surface.dispatchEvent(touchMenu);
    expect(touchMenu.defaultPrevented).toBe(true);
    send('pointerup', 1, 20, 20);

    const mouseMenu = new Event('contextmenu', { cancelable: true });
    surface.dispatchEvent(mouseMenu);
    expect(mouseMenu.defaultPrevented).toBe(false);
  });

  it('ignores a right or middle mouse button, which is not a gesture', () => {
    const event = Object.assign(new Event('pointerdown', { cancelable: true }), {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
      button: 2,
    });
    surface.dispatchEvent(event);
    vi.advanceTimersByTime(1000);
    send('pointerup', 1, 10, 10, 'mouse');
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onHover).not.toHaveBeenCalled();
  });

  it('does nothing with a touch that moves without having been pressed', () => {
    send('pointermove', 9, 10, 10);
    expect(handlers.onPan).not.toHaveBeenCalled();
    expect(handlers.onHover).not.toHaveBeenCalled();
  });

  it('opens a passage on a double tap in the same place', () => {
    send('pointerdown', 1, 80, 80);
    send('pointerup', 1, 80, 80);
    vi.advanceTimersByTime(50);
    send('pointerdown', 1, 82, 81);
    send('pointerup', 1, 82, 81);
    expect(handlers.onDoubleTap).toHaveBeenCalledOnce();
    expect(handlers.onTap).toHaveBeenCalledOnce();
  });

  it('treats two taps far apart as two taps, not one double', () => {
    send('pointerdown', 1, 80, 80);
    send('pointerup', 1, 80, 80);
    vi.advanceTimersByTime(50);
    send('pointerdown', 1, 300, 300);
    send('pointerup', 1, 300, 300);
    expect(handlers.onDoubleTap).not.toHaveBeenCalled();
    expect(handlers.onTap).toHaveBeenCalledTimes(2);
  });

  it('keeps panning with the finger left behind when the other lifts', () => {
    send('pointerdown', 1, 100, 100);
    send('pointerdown', 2, 200, 100);
    send('pointerup', 2, 200, 100);
    handlers.onPan.mockClear();
    send('pointermove', 1, 140, 100);
    expect(handlers.onPan).toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('goes on pinching with the two fingers left of three', () => {
    send('pointerdown', 1, 100, 100);
    send('pointerdown', 2, 200, 100);
    send('pointerdown', 3, 300, 100);
    send('pointerup', 3, 300, 100);
    handlers.onZoom.mockClear();
    send('pointermove', 2, 300, 100);
    expect(handlers.onZoom).toHaveBeenCalled();
  });

  it('cancels a press without selecting anything', () => {
    send('pointerdown', 1, 50, 50);
    send('pointercancel', 1, 50, 50);
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('says a finger went down at once, so whatever still moves can stop', () => {
    send('pointerdown', 1, 50, 50);
    expect(handlers.onGrab).toHaveBeenCalledOnce();
    send('pointerdown', 2, 150, 50);
    expect(handlers.onGrab).toHaveBeenCalledTimes(2);
  });

  it('lets go of a flick with its speed', () => {
    send('pointerdown', 1, 100, 100);
    for (let step = 1; step <= 5; step += 1) {
      vi.advanceTimersByTime(16);
      send('pointermove', 1, 100 + step * 32, 100);
    }
    send('pointerup', 1, 260, 100);
    expect(handlers.onRelease).toHaveBeenCalledOnce();
    const velocity = handlers.onRelease.mock.calls[0]?.[0];
    expect(velocity?.x).toBeCloseTo(2); // 32px every 16ms
    expect(velocity?.y).toBe(0);
  });

  it('lets go at rest when the finger stopped before lifting', () => {
    send('pointerdown', 1, 100, 100);
    vi.advanceTimersByTime(16);
    send('pointermove', 1, 160, 100);
    vi.advanceTimersByTime(200);
    send('pointerup', 1, 160, 100);
    expect(handlers.onRelease).toHaveBeenCalledWith(AT_REST);
  });

  it('lets go at rest after a tap, a preview or a cancelled drag', () => {
    send('pointerdown', 1, 50, 50);
    send('pointerup', 1, 50, 50);
    expect(handlers.onRelease).toHaveBeenLastCalledWith(AT_REST);

    vi.advanceTimersByTime(1000);
    send('pointerdown', 1, 50, 50);
    vi.advanceTimersByTime(HOLD_TO_PREVIEW_MS);
    send('pointermove', 1, 50, 150);
    send('pointerup', 1, 50, 150);
    expect(handlers.onRelease).toHaveBeenLastCalledWith(AT_REST);

    send('pointerdown', 1, 50, 50);
    vi.advanceTimersByTime(16);
    send('pointermove', 1, 90, 50);
    send('pointercancel', 1, 90, 50);
    expect(handlers.onRelease).toHaveBeenLastCalledWith(AT_REST);
    expect(handlers.onRelease).toHaveBeenCalledTimes(3);
  });

  it('lets go only when the last finger of a pinch lifts, with the speed of its center', () => {
    send('pointerdown', 1, 100, 100);
    send('pointerdown', 2, 200, 100);
    vi.advanceTimersByTime(16);
    send('pointermove', 1, 116, 100);
    send('pointermove', 2, 216, 100);
    send('pointerup', 2, 216, 100);
    expect(handlers.onRelease).not.toHaveBeenCalled();
    send('pointerup', 1, 116, 100);
    expect(handlers.onRelease).toHaveBeenCalledOnce();
    expect(handlers.onRelease.mock.calls[0]?.[0].x).toBeGreaterThan(0);
  });

  it('tells a pinch from a wheel', () => {
    send('pointerdown', 1, 100, 100);
    send('pointerdown', 2, 200, 100);
    send('pointermove', 2, 300, 100);
    expect(handlers.onZoom.mock.calls[0]?.[2]).toBe('pinch');
  });

  it('clears the hover when the mouse leaves the stage', () => {
    send('pointerleave', 1, 0, 0, 'mouse');
    expect(handlers.onLeave).toHaveBeenCalledOnce();
  });

  it('keeps the hover while a finger is still down and the pointer leaves', () => {
    send('pointerdown', 1, 50, 50);
    handlers.onLeave.mockClear();
    send('pointerleave', 1, 0, 0, 'mouse');
    expect(handlers.onLeave).not.toHaveBeenCalled();
  });
});

describe('attachGestures, with a wheel', () => {
  const createHandlers = () => ({
    onPan: vi.fn<NonNullable<GestureHandlers['onPan']>>(),
    onZoom: vi.fn<NonNullable<GestureHandlers['onZoom']>>(),
  });
  let surface: Surface;
  let handlers: ReturnType<typeof createHandlers>;
  let detach: () => void;

  const wheel = (deltaX: number, deltaY: number, ctrlKey = false) => {
    const event = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaX,
      deltaY,
      deltaMode: 0,
      ctrlKey,
      clientX: 100,
      clientY: 100,
    });
    surface.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    surface = new Surface();
    handlers = createHandlers();
    detach = attachGestures(surface, handlers);
  });

  afterEach(() => {
    detach();
  });

  it('zooms on a vertical wheel, around the pointer', () => {
    wheel(0, -120);
    expect(handlers.onZoom).toHaveBeenCalledOnce();
    expect(handlers.onZoom.mock.calls[0]?.[0]).toBeGreaterThan(1);
    expect(handlers.onZoom.mock.calls[0]?.[1]).toEqual({ x: 100, y: 100 });
    expect(handlers.onZoom.mock.calls[0]?.[2]).toBe('wheel');
  });

  it('pans sideways on a horizontal wheel, as a trackpad swipe does', () => {
    wheel(60, 0);
    expect(handlers.onPan).toHaveBeenCalledWith(-60, 0);
    expect(handlers.onZoom).not.toHaveBeenCalled();
  });

  it('zooms on a trackpad pinch, which arrives as a wheel with Ctrl held', () => {
    wheel(40, -10, true);
    expect(handlers.onZoom).toHaveBeenCalledOnce();
    expect(handlers.onZoom.mock.calls[0]?.[2]).toBe('pinch');
  });

  it('never lets the page scroll instead', () => {
    expect(wheel(0, -120).defaultPrevented).toBe(true);
  });

  it('stops listening once detached', () => {
    detach();
    wheel(0, -120);
    expect(handlers.onZoom).not.toHaveBeenCalled();
  });
});
