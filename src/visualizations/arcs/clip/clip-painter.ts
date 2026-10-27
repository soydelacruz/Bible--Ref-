import { elementAt } from '../../../core/lib/array.ts';
import { CAPTION_BAND_HEIGHT, drawCaption } from '../../shared/image-export.ts';
import { GENRE_HEX, VIZ_SURFACE } from '../../shared/palette.ts';
import { computeArcLayout, verseToAlong } from '../arc-layout.ts';
import { paintAxis } from '../axis-painter.ts';
import { fullView } from '../axis-view.ts';
import type { ClipType } from './clip-format.ts';
import { recordClip, type ClipRecording } from './clip-recorder.ts';
import { wrapText, type ClipScene } from './clip-scene.ts';
import { clipTimeline, framePhase, linkGrowth, type ClipTimeline } from './clip-timeline.ts';

/**
 * The clip is a 1080 px square. It suits the picture — a horizontal axis with arcs rising over
 * it, words above and the caption below — and every feed and chat shows a square whole, where
 * a 9:16 story frame would leave the arcs a narrow strip or turn the axis on end. It is also the
 * smaller of the two: 1.2 million pixels a frame against 9:16's 2.1, which is what a phone's
 * memory and encoder feel.
 */
export const CLIP_SIZE = 1080;
/** Drawn at half size and doubled, so the diagram's own sizes (11 px labels) read on a phone. */
const RATIO = 2;
const SIDE = CLIP_SIZE / RATIO;

const TEXT = '#ecebe6';
const MUTED = '#9a9890';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const PADDING = 28;
const REFERENCE_FONT = `600 24px ${SANS}`;
const ABBREVIATION_FONT = `13px ${SANS}`;
const WORDS_FONT = `17px ${SERIF}`;
const WORDS_LINE_HEIGHT = 25;
const MAX_WORD_LINES = 5;
const CREDIT_FONT = `10px ${SANS}`;
const CREDIT_LINE_HEIGHT = 13;
const MAX_CREDIT_LINES = 3;
/** Between the words and the tallest arc. */
const WORDS_GAP = 14;

/** A landed arc's width: thick enough to stay a line once the video is compressed. */
const ARC_WIDTH = 1.6;
/** The soft light around an arc while it grows, fading as it lands. */
const HALO_WIDTH = 7;
const HALO_ALPHA = 0.22;
const TIP_RADIUS = 2.4;
const TIP_HALO_RADIUS = 7;
/**
 * Up to this many links, each keeps its full brightness; past it they are dimmed together, so a
 * chapter's hundreds of links, whose light adds up, keep their colors instead of burning white.
 */
const FULL_BRIGHTNESS_LINKS = 60;

/** One arc, laid out: half an ellipse over the axis, as the diagram's shader draws it. */
interface ArcPath {
  readonly hereX: number;
  readonly thereX: number;
  readonly centerX: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly hereColor: string;
  readonly thereColor: string;
  /** Once landed, as bright as the diagram's focused links: more votes, more light. */
  readonly alpha: number;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('A 2D canvas is not available.');
  }
  return context;
}

/** A layer at the clip's pixels, drawn on in half-size units. */
function createLayer(width = CLIP_SIZE, height = CLIP_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  context2d(canvas).setTransform(RATIO, 0, 0, RATIO, 0, 0);
  return canvas;
}

/**
 * Draws the frames of a passage's clip. What never moves — the words, the axis, the caption — is
 * drawn once; a link is drawn once more when it lands, on a layer of landed links; and a frame
 * draws only the links still growing over those two. A frame's work stays about the same whether
 * the passage has five links or a thousand.
 */
export class ClipPainter {
  readonly #context: CanvasRenderingContext2D;
  readonly #timeline: ClipTimeline;
  readonly #background: HTMLCanvasElement;
  readonly #landedLayer: HTMLCanvasElement;
  readonly #landedContext: CanvasRenderingContext2D;
  readonly #arcs: readonly ArcPath[];
  readonly #baseline: number;
  #landed = 0;

  constructor(canvas: HTMLCanvasElement, scene: ClipScene, timeline: ClipTimeline) {
    canvas.width = CLIP_SIZE;
    canvas.height = CLIP_SIZE;
    this.#context = context2d(canvas);
    this.#timeline = timeline;
    this.#background = createLayer();
    this.#landedLayer = createLayer();
    this.#landedContext = context2d(this.#landedLayer);
    // Light adds up where links cross, as in the diagram.
    this.#landedContext.globalCompositeOperation = 'lighter';

    const background = context2d(this.#background);
    background.fillStyle = VIZ_SURFACE;
    background.fillRect(0, 0, SIDE, SIDE);
    const regionTop = paintWords(background, scene) + WORDS_GAP;
    const bandTop = SIDE - CAPTION_BAND_HEIGHT;
    const layout = computeArcLayout(SIDE, bandTop - regionTop);
    const view = fullView(scene.versification.verseCount);
    const along = (verse: number) => verseToAlong(layout, view, verse);

    const axis = createLayer(CLIP_SIZE, layout.height * RATIO);
    paintAxis(context2d(axis), {
      layout,
      view,
      versification: scene.versification,
      names: scene.names,
      genreNames: scene.genreNames,
      focus: scene.range,
      hover: null,
      passage: null,
    });
    background.drawImage(axis, 0, regionTop, SIDE, layout.height);
    this.#baseline = regionTop + layout.baseline;
    const passageCenter = (scene.range.start + scene.range.end + 1) / 2;
    paintPassageGlow(background, along(passageCenter), this.#baseline);
    drawCaption(background, scene.caption, bandTop, SIDE, 1);

    const density = Math.min(1, Math.sqrt(FULL_BRIGHTNESS_LINKS / Math.max(scene.arcs.length, 1)));
    this.#arcs = scene.arcs.map((arc) => {
      const hereX = along(arc.here);
      const thereX = along(arc.there);
      const radiusX = Math.abs(thereX - hereX) / 2;
      return {
        hereX,
        thereX,
        centerX: (hereX + thereX) / 2,
        radiusX,
        radiusY: Math.min(radiusX, layout.maxArcHeight),
        hereColor: elementAt(GENRE_HEX, arc.hereGenre),
        thereColor: elementAt(GENRE_HEX, arc.thereGenre),
        alpha: (0.35 + 0.55 * arc.weight) * density,
      };
    });
  }

  /** Draws the frame at a time from the clip's start; frames are drawn in order. */
  paint(timeMs: number): void {
    const { landed, started } = framePhase(this.#timeline, timeMs);
    if (landed < this.#landed) {
      this.#landedContext.clearRect(0, 0, SIDE, SIDE);
      this.#landed = 0;
    }
    for (; this.#landed < landed; this.#landed += 1) {
      this.#drawArc(this.#landedContext, this.#landed, 1);
    }
    const context = this.#context;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(this.#background, 0, 0);
    context.globalCompositeOperation = 'lighter';
    context.drawImage(this.#landedLayer, 0, 0);
    context.setTransform(RATIO, 0, 0, RATIO, 0, 0);
    for (let index = landed; index < started; index += 1) {
      this.#drawArc(context, index, linkGrowth(this.#timeline, index, timeMs));
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
  }

  /** An arc grown `growth` of the way from the passage, glowing while it grows. */
  #drawArc(context: CanvasRenderingContext2D, index: number, growth: number): void {
    const arc = elementAt(this.#arcs, index);
    if (arc.radiusX < 0.25) {
      // Both ends at one spot of the axis: a link within a chapter, at the scale of the Bible.
      return;
    }
    const rightward = arc.thereX >= arc.hereX;
    // Angles on the ellipse: π is its left end and 2π its right; the top is between them.
    const start = rightward ? Math.PI : 2 * Math.PI;
    const end = start + (rightward ? 1 : -1) * growth * Math.PI;
    const trace = () => {
      context.beginPath();
      context.ellipse(
        arc.centerX,
        this.#baseline,
        arc.radiusX,
        arc.radiusY,
        0,
        start,
        end,
        !rightward,
      );
    };
    const gradient = context.createLinearGradient(arc.hereX, 0, arc.thereX, 0);
    gradient.addColorStop(0, arc.hereColor);
    gradient.addColorStop(1, arc.thereColor);
    context.strokeStyle = gradient;
    context.lineCap = 'round';
    const glow = 1 - growth;
    if (glow > 0) {
      context.globalAlpha = HALO_ALPHA * glow;
      context.lineWidth = HALO_WIDTH;
      trace();
      context.stroke();
    }
    // Bright while it travels, settling to its own brightness as it lands.
    context.globalAlpha = arc.alpha + (1 - arc.alpha) * glow;
    context.lineWidth = ARC_WIDTH;
    trace();
    context.stroke();
    if (glow > 0) {
      const tipX = arc.centerX + arc.radiusX * Math.cos(end);
      const tipY = this.#baseline + arc.radiusY * Math.sin(end);
      context.fillStyle = arc.thereColor;
      context.globalAlpha = 0.3 * glow;
      context.beginPath();
      context.arc(tipX, tipY, TIP_HALO_RADIUS, 0, 2 * Math.PI);
      context.fill();
      context.fillStyle = TEXT;
      context.globalAlpha = glow;
      context.beginPath();
      context.arc(tipX, tipY, TIP_RADIUS, 0, 2 * Math.PI);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}

/** The reference, the words and any credit they carry, from the top; returns where they end. */
function paintWords(context: CanvasRenderingContext2D, { reference, words }: ClipScene): number {
  const width = SIDE - 2 * PADDING;
  const measure = (text: string) => context.measureText(text).width;
  let y = PADDING + 22;
  context.textBaseline = 'alphabetic';
  context.font = REFERENCE_FONT;
  context.fillStyle = TEXT;
  context.fillText(reference, PADDING, y, width);
  if (!words) {
    return y + 10;
  }
  const after = PADDING + Math.min(measure(reference), width) + 10;
  context.font = ABBREVIATION_FONT;
  context.fillStyle = MUTED;
  context.fillText(words.abbreviation, after, y);
  y += 14;
  context.textBaseline = 'top';
  context.font = WORDS_FONT;
  context.fillStyle = TEXT;
  for (const line of wrapText(words.text, width, MAX_WORD_LINES, measure)) {
    context.fillText(line, PADDING, y, width);
    y += WORDS_LINE_HEIGHT;
  }
  if (words.credit) {
    y += 4;
    context.font = CREDIT_FONT;
    context.fillStyle = MUTED;
    for (const line of wrapText(words.credit, width, MAX_CREDIT_LINES, measure)) {
      context.fillText(line, PADDING, y, width);
      y += CREDIT_LINE_HEIGHT;
    }
  }
  return y;
}

/** A still, soft light where the passage sits on the axis: where every link starts from. */
function paintPassageGlow(context: CanvasRenderingContext2D, x: number, y: number): void {
  const radius = 22;
  const light = context.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, 'rgb(236 235 230 / 0.4)');
  light.addColorStop(1, 'rgb(236 235 230 / 0)');
  context.fillStyle = light;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** A clip being made: its recording, and the canvas it plays on, to show while it does. */
export interface ClipMaking {
  readonly preview: HTMLCanvasElement;
  readonly recording: ClipRecording;
}

/** Starts making a passage's clip: plays it on a canvas of its own, and records it. */
export function makeClip(
  scene: ClipScene,
  type: ClipType,
  onProgress: (share: number) => void,
): ClipMaking {
  const timeline = clipTimeline(scene.arcs.length);
  const canvas = document.createElement('canvas');
  const painter = new ClipPainter(canvas, scene, timeline);
  const recording = recordClip({
    canvas,
    type,
    durationMs: timeline.durationMs,
    paint: (timeMs) => {
      painter.paint(timeMs);
    },
    onProgress,
  });
  return { preview: canvas, recording };
}
