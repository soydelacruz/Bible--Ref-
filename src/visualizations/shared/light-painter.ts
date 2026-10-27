import type { FlightFrame } from './loading-arcs.ts';
import { GENRE_HEX, GENRE_RGB, type Rgb } from './palette.ts';

/**
 * Paints the loading screen's arcs of light (see `loading-arcs.ts`): a faint trace along the way
 * travelled, a light brighter toward its head, a glow at the head, and a flash where it lands. The
 * loading screen paints them over its axis, and a path's light over Arcs and Clusters, so that a
 * chain of cross-references travels the same light the reader first saw.
 */

export type Point = readonly [x: number, y: number];

/** What a light travels on screen: a curve from its start (0) to where it lands (1). */
export interface LightCurve {
  readonly pointAt: (t: number) => Point;
  /** Genre ordinals at both ends, which color it from one to the other. */
  readonly fromGenre: number;
  readonly toGenre: number;
}

/** The trace a light leaves along its way: the loading screen's fades out, a path's stays. */
export interface TraceStyle {
  readonly width: number;
  readonly alpha: number;
}

export const LOADING_TRACE: TraceStyle = { width: 1.2, alpha: 0.16 };

/** Pieces of the moving light, brighter toward its head. */
const LIGHT_PIECES = 10;

const rgba = ([red, green, blue]: Rgb, alpha: number) =>
  `rgb(${String(Math.round(red * 255))} ${String(Math.round(green * 255))} ${String(Math.round(blue * 255))} / ${String(alpha)})`;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const genreHex = (genre: number) => GENRE_HEX[genre] ?? '#ffffff';
const genreRgb = (genre: number): Rgb => GENRE_RGB[genre] ?? [1, 1, 1];

/** Strokes the part of a curve between `from` and `to` (0–1 along it). */
function strokeCurve(
  context: CanvasRenderingContext2D,
  pointAt: (t: number) => Point,
  from: number,
  to: number,
  width: number,
  alpha: number,
): void {
  const steps = Math.max(2, Math.ceil((to - from) * 64));
  context.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const [x, y] = pointAt(from + ((to - from) * step) / steps);
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.lineWidth = width;
  context.globalAlpha = alpha;
  context.stroke();
}

/** A soft round glow, white at its heart. */
function glow(
  context: CanvasRenderingContext2D,
  [x, y]: Point,
  radius: number,
  color: Rgb,
  intensity: number,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgb(255 255 255 / ${String(0.9 * intensity)})`);
  gradient.addColorStop(0.25, rgba(color, 0.55 * intensity));
  gradient.addColorStop(1, rgba(color, 0));
  context.globalAlpha = 1;
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/**
 * Paints one light as it is at `frame`. Lights are meant to add up where they cross, like the glow
 * of the Arcs view: the caller sets `globalCompositeOperation` to `'lighter'` (and round caps)
 * before painting them, and back after.
 */
export function paintLight(
  context: CanvasRenderingContext2D,
  curve: LightCurve,
  frame: FlightFrame,
  trace: TraceStyle = LOADING_TRACE,
): void {
  const { pointAt, fromGenre, toGenre } = curve;
  const start = pointAt(0);
  const end = pointAt(1);
  // Colored from one end's genre to the other's; a gradient between two equal points paints nothing.
  if (start[0] === end[0] && start[1] === end[1]) {
    context.strokeStyle = genreHex(fromGenre);
  } else {
    const gradient = context.createLinearGradient(start[0], start[1], end[0], end[1]);
    gradient.addColorStop(0, genreHex(fromGenre));
    gradient.addColorStop(1, genreHex(toGenre));
    context.strokeStyle = gradient;
  }

  if (frame.trace > 0 && frame.head > 0) {
    strokeCurve(context, pointAt, 0, frame.head, trace.width, trace.alpha * frame.trace);
  }
  if (frame.light > 0 && frame.head > frame.tail) {
    for (let piece = 0; piece < LIGHT_PIECES; piece += 1) {
      const from = frame.tail + ((frame.head - frame.tail) * piece) / LIGHT_PIECES;
      const to = frame.tail + ((frame.head - frame.tail) * (piece + 1)) / LIGHT_PIECES;
      const intensity = frame.light * ((piece + 1) / LIGHT_PIECES) ** 1.6;
      strokeCurve(context, pointAt, from, to, 9, 0.05 * intensity);
      strokeCurve(context, pointAt, from, to, 3.5, 0.2 * intensity);
      strokeCurve(context, pointAt, from, to, 1.4, 0.9 * intensity);
    }
    const headColor = mix(genreRgb(fromGenre), genreRgb(toGenre), frame.head);
    glow(context, pointAt(frame.head), 10, headColor, frame.light);
  }
  if (frame.landing > 0) {
    glow(context, end, 24, genreRgb(toGenre), frame.landing);
  }
}
