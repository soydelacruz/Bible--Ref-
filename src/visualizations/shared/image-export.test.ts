import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  composeImage,
  downloadImage,
  imageFileName,
  type ImageCanvas,
  type ImageContext,
} from './image-export.ts';

/** A canvas that records what is drawn on it. */
function recordingCanvas() {
  const calls: string[] = [];
  const context = {
    fillStyle: '',
    font: '',
    textBaseline: 'alphabetic',
    fillRect: (x: number, y: number, width: number, height: number) => {
      calls.push(`rect ${String(x)},${String(y)} ${String(width)}x${String(height)}`);
    },
    fillText: (text: string, x: number, y: number) => {
      calls.push(`text "${text}" at ${String(x)},${String(y)}`);
    },
    drawImage: (layer: { id: string }) => {
      calls.push(`image ${layer.id}`);
    },
  } as unknown as ImageContext;
  const canvas: ImageCanvas = { width: 0, height: 0, getContext: () => context };
  return { canvas, calls };
}

const CAPTION = {
  title: 'Romans 8 · Bible Cross-References',
  url: 'https://example.org/?ref=Rom.8',
  credit: 'Cross-reference data: OpenBible.info (CC BY 4.0).',
};

describe('composeImage', () => {
  it('lays the layers over one another, in order, with the caption below them', () => {
    const { canvas, calls } = recordingCanvas();
    const layers = [
      { id: 'arcs', width: 800, height: 400 },
      { id: 'axis', width: 800, height: 400 },
    ];
    const result = composeImage(layers, CAPTION, 2, () => canvas);
    expect(result.width).toBe(800);
    expect(result.height).toBe(400 + 152);
    expect(calls).toEqual([
      'rect 0,0 800x552',
      'image arcs',
      'image axis',
      'text "Romans 8 · Bible Cross-References" at 32,424',
      'text "https://example.org/?ref=Rom.8" at 32,464',
      'text "Cross-reference data: OpenBible.info (CC BY 4.0)." at 32,504',
    ]);
  });

  it('says so when there is no 2D canvas to draw on', () => {
    const canvas: ImageCanvas = { width: 0, height: 0, getContext: () => null };
    expect(() => composeImage([], CAPTION, 1, () => canvas)).toThrow(/2D canvas/);
  });
});

describe('imageFileName', () => {
  it.each([
    ['Romans 8 · Bible Cross-References', 'romans-8-bible-cross-references.png'],
    [
      'Gênesis 1:1 · Referências Cruzadas da Bíblia',
      'genesis-1-1-referencias-cruzadas-da-biblia.png',
    ],
    ['· ·', 'bible-cross-references.png'],
  ])('names %s as %s', (title, name) => {
    expect(imageFileName(title)).toBe(name);
  });
});

describe('downloadImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('hands the picture over as a file of the given name', async () => {
    vi.useFakeTimers();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download });
    });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png']));
    });

    await downloadImage(canvas, 'romans-8.png');
    expect(createUrl).toHaveBeenCalled();
    expect(clicks).toEqual([{ href: 'blob:picture', download: 'romans-8.png' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:picture');
  });

  it('fails when the browser cannot make the picture', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
      callback(null);
    });
    await expect(downloadImage(canvas, 'x.png')).rejects.toThrow(/could not be made/);
  });
});
