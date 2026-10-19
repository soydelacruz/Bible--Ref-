import { VIZ_SURFACE } from './palette.ts';

/** What the picture says under the drawing: what it shows, where to see it, and whose data it is. */
export interface ImageCaption {
  readonly title: string;
  readonly url: string;
  readonly credit: string;
}

/** The part of a 2D context the picture is drawn with, so a test can stand in for a canvas. */
export type ImageContext = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textBaseline' | 'fillRect' | 'fillText' | 'drawImage'
>;

export interface ImageCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): ImageContext | null;
}

/** A layer of the drawing, already at device pixels: a canvas, in practice. */
export interface ImageLayer {
  readonly width: number;
  readonly height: number;
}

const TEXT = '#ecebe6';
const MUTED = '#9a9890';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
/** The caption band, in CSS pixels: three lines and room around them. */
const BAND_HEIGHT = 76;
const MARGIN = 16;

/**
 * Draws the layers of a view one over the other, with a caption band below: the title, the
 * address to see it live, and the credit the data's licence asks for, which a picture shared on
 * its own would otherwise lose.
 */
export function composeImage(
  layers: readonly ImageLayer[],
  caption: ImageCaption,
  ratio: number,
  createCanvas: () => ImageCanvas,
): ImageCanvas {
  const [base] = layers;
  const width = base?.width ?? 0;
  const height = base?.height ?? 0;
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height + Math.round(BAND_HEIGHT * ratio);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('A 2D canvas is not available.');
  }
  context.fillStyle = VIZ_SURFACE;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const layer of layers) {
    context.drawImage(layer as CanvasImageSource, 0, 0, width, height);
  }
  context.textBaseline = 'top';
  const lines = [
    { text: caption.title, font: `600 ${String(15 * ratio)}px ${FONT}`, color: TEXT },
    { text: caption.url, font: `${String(12 * ratio)}px ${FONT}`, color: MUTED },
    { text: caption.credit, font: `${String(11 * ratio)}px ${FONT}`, color: MUTED },
  ];
  let y = height + 12 * ratio;
  for (const line of lines) {
    context.font = line.font;
    context.fillStyle = line.color;
    context.fillText(line.text, MARGIN * ratio, y, width - 2 * MARGIN * ratio);
    y += 20 * ratio;
  }
  return canvas;
}

/** A file name from a title: `Romans 8 · Bible Cross-References` → `romans-8-bible-cross-references.png`. */
export function imageFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'bible-cross-references' : slug}.png`;
}

/** Hands the picture to the reader as a download. */
export function downloadImage(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The picture could not be made.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      // After the click has been handled: revoking at once can cancel the download in Safari.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      resolve();
    }, 'image/png');
  });
}
