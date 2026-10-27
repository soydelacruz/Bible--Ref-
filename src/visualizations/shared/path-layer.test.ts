import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightCurve } from './light-painter.ts';
import { paintLight } from './light-painter.ts';
import { PathLayer } from './path-layer.ts';
import { RESTING_HOP } from './path-light.ts';

vi.mock('./light-painter.ts', () => ({ paintLight: vi.fn() }));

const TRACE = { width: 1, alpha: 0.5 };

/** The parts of a 2D context the layer uses itself; the light is painted by `paintLight`. */
function stubContext() {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    lineCap: 'butt',
  };
}

function canvasWith(context: ReturnType<typeof stubContext> | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as RenderingContext);
  return canvas;
}

/** A hop's curve, told apart in what is painted by the hop's length. */
const curve = (hop: string): LightCurve => ({
  pointAt: () => [0, 0],
  fromGenre: hop.length,
  toGenre: 0,
});

describe('PathLayer', () => {
  let context = stubContext();

  beforeEach(() => {
    context = stubContext();
    vi.mocked(paintLight).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The hops painted, by the curve each was painted on. */
  function painted(): number[] {
    return vi.mocked(paintLight).mock.calls.map(([, light]) => light.fromGenre);
  }

  it('needs a 2D canvas', () => {
    expect(() => new PathLayer(canvasWith(null), TRACE)).toThrow('Canvas 2D is not available.');
  });

  it('draws the hops it can place, as they are, and again when the picture moves', async () => {
    const layer = new PathLayer<string>(canvasWith(context), TRACE);
    layer.setSize(300, 200);
    expect(context.setTransform).toHaveBeenCalled();
    layer.setCurves((hop) => (hop === 'off' ? null : curve(hop)));
    const played = layer.play(['a', 'off', 'ccc'], 'instant');
    await expect(played).resolves.toBe(true);
    expect(painted()).toEqual([1, 3]);
    expect(vi.mocked(paintLight).mock.calls[0]?.[2]).toEqual(RESTING_HOP);
    expect(vi.mocked(paintLight).mock.calls[0]?.[3]).toBe(TRACE);
    expect(context.globalCompositeOperation).toBe('source-over');

    vi.mocked(paintLight).mockClear();
    layer.setCurves(curve);
    expect(painted()).toEqual([1, 3, 3]);
  });

  it('takes the path off when its signal aborts, but not a later one', async () => {
    const layer = new PathLayer<string>(canvasWith(context), TRACE);
    layer.setCurves(curve);
    const first = new AbortController();
    const second = new AbortController();
    await layer.play(['a'], 'instant', { signal: first.signal });
    void layer.play(['bb'], 'instant', { signal: second.signal });
    first.abort();
    vi.mocked(paintLight).mockClear();
    layer.setCurves(curve);
    expect(painted()).toEqual([2]);

    second.abort();
    vi.mocked(paintLight).mockClear();
    layer.setCurves(curve);
    expect(painted()).toEqual([]);
  });

  it('plays nothing for a signal already aborted', async () => {
    const layer = new PathLayer<string>(canvasWith(context), TRACE);
    const signal = AbortSignal.abort();
    await expect(layer.play(['a'], 'instant', { signal })).resolves.toBe(false);
    layer.setCurves(curve);
    expect(painted()).toEqual([]);
  });

  it('stops a path under way when another comes, or it is cleared, or lands it at once', async () => {
    vi.useFakeTimers();
    const layer = new PathLayer<string>(canvasWith(context), TRACE);
    layer.setCurves(curve);
    const first = layer.play(['a'], 'still');
    const second = layer.play(['a'], 'still');
    await expect(first).resolves.toBe(false);
    layer.finish();
    await expect(second).resolves.toBe(true);
    const third = layer.play(['a'], 'still');
    layer.clear();
    await expect(third).resolves.toBe(false);
    expect(context.clearRect).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('takes away the canvas it made, and leaves one it was given', () => {
    const host = document.createElement('div');
    const under = document.createElement('canvas');
    under.className = 'canvas';
    host.append(under);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as RenderingContext,
    );
    const layer = PathLayer.over<string>(under, TRACE);
    const added = host.lastElementChild;
    expect(added).toBe(layer.canvas);
    expect(added).not.toBe(under);
    expect(added?.className).toBe('canvas');
    expect(added?.getAttribute('aria-hidden')).toBe('true');
    layer.dispose();
    expect(host.children).toHaveLength(1);

    new PathLayer<string>(under, TRACE).dispose();
    expect(host.children).toHaveLength(1);
  });
});
