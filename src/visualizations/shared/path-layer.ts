import { MAX_PIXEL_RATIO } from './frames.ts';
import { paintLight, type LightCurve, type TraceStyle } from './light-painter.ts';
import { PathRun, type PathFrames, type PathMode, type PathPlayOptions } from './path-light.ts';

/**
 * A chain's light on a canvas of its own, laid over a view's picture: while the light travels only
 * this canvas is drawn again, never the links or dots under it, and only until the last hop lands.
 * At rest it holds the whole chain, quietly, and is drawn again only when the picture under it
 * moves. `Hop` is however the view knows a hop; `curveOf` says where it is on screen now.
 */
export class PathLayer<Hop> {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #trace: TraceStyle;
  /** Made by `over`, and so taken away with the layer. */
  readonly #own: boolean;
  #width = 0;
  #height = 0;
  #hops: readonly Hop[] = [];
  #curveOf: (hop: Hop) => LightCurve | null = () => null;
  #run: PathRun | null = null;
  #unlisten: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, trace: TraceStyle, own = false) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D is not available.');
    }
    this.#canvas = canvas;
    this.#context = context;
    this.#trace = trace;
    this.#own = own;
    // Found by it in the end-to-end tests, and in the developer tools.
    canvas.setAttribute('data-path-light', '');
  }

  /** A layer on a canvas of its own, put right over `canvas` and styled like it. */
  static over<Hop>(canvas: HTMLCanvasElement, trace: TraceStyle): PathLayer<Hop> {
    const layer = document.createElement('canvas');
    layer.className = canvas.className;
    layer.setAttribute('aria-hidden', 'true');
    canvas.after(layer);
    return new PathLayer(layer, trace, true);
  }

  /** For a picture of the view as it is: the light lies over everything else. */
  get canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  setSize(width: number, height: number): void {
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    this.#width = width;
    this.#height = height;
    this.#canvas.width = Math.round(width * ratio);
    this.#canvas.height = Math.round(height * ratio);
    this.#context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.#repaint();
  }

  /** Where the hops are on screen now (`null` for one that can't be shown): the picture moved. */
  setCurves(curveOf: (hop: Hop) => LightCurve | null): void {
    this.#curveOf = curveOf;
    this.#repaint();
  }

  /** Plays `hops` (see `PathRun`), in place of whatever was drawn; resolves as its `done`. */
  play(hops: readonly Hop[], mode: PathMode, options: PathPlayOptions = {}): Promise<boolean> {
    this.clear();
    const { signal, onLit } = options;
    if (signal?.aborted) {
      return Promise.resolve(false);
    }
    this.#hops = hops;
    const run = new PathRun(
      hops.length,
      mode,
      (frames) => {
        this.#paint(frames);
      },
      onLit,
    );
    this.#run = run;
    if (signal) {
      const abort = () => {
        if (this.#run === run) {
          this.clear();
        }
      };
      signal.addEventListener('abort', abort, { once: true });
      this.#unlisten = () => {
        signal.removeEventListener('abort', abort);
      };
    }
    return run.done;
  }

  /** Lands a path under way at once, drawn whole. */
  finish(): void {
    this.#run?.finish();
  }

  /** Takes the path off the picture; one under way stops at once. */
  clear(): void {
    this.#unlisten?.();
    this.#unlisten = null;
    const run = this.#run;
    this.#run = null;
    this.#hops = [];
    run?.cancel();
    this.#context.clearRect(0, 0, this.#width, this.#height);
  }

  dispose(): void {
    this.clear();
    if (this.#own) {
      this.#canvas.remove();
    }
  }

  #repaint(): void {
    if (this.#run) {
      this.#paint(this.#run.frames());
    }
  }

  #paint(frames: PathFrames): void {
    const context = this.#context;
    context.clearRect(0, 0, this.#width, this.#height);
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    this.#hops.forEach((hop, position) => {
      const frame = frames[position];
      const curve = frame && this.#curveOf(hop);
      if (frame && curve) {
        paintLight(context, curve, frame, this.#trace);
      }
    });
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  }
}
