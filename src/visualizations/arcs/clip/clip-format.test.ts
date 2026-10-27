import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShareFile,
  chooseClipType,
  clipFileName,
  supportedClipType,
  type ClipType,
} from './clip-format.ts';

/** A recorder that takes exactly these types. */
const takes =
  (...types: string[]) =>
  (mimeType: string) =>
    types.includes(mimeType);

describe('chooseClipType', () => {
  it('records MP4 where the browser can (Safari, Chrome with H.264)', () => {
    expect(chooseClipType(takes('video/mp4'))).toEqual({
      mimeType: 'video/mp4',
      container: 'video/mp4',
      extension: 'mp4',
    });
    expect(
      chooseClipType(takes('video/webm;codecs=vp9', 'video/mp4;codecs=avc1', 'video/mp4'))
        ?.mimeType,
    ).toBe('video/mp4;codecs=avc1');
  });

  it('records WebM where it can’t, with the best codec it takes', () => {
    expect(chooseClipType(takes('video/webm;codecs=vp9', 'video/webm;codecs=vp8'))).toEqual({
      mimeType: 'video/webm;codecs=vp9',
      container: 'video/webm',
      extension: 'webm',
    });
    expect(chooseClipType(takes('video/webm;codecs=vp8', 'video/webm'))?.mimeType).toBe(
      'video/webm;codecs=vp8',
    );
    expect(chooseClipType(takes('video/webm'))?.mimeType).toBe('video/webm');
  });

  it('records nothing where it takes none of them', () => {
    expect(chooseClipType(takes('video/x-matroska'))).toBeNull();
  });
});

describe('supportedClipType', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
  });

  it('is nothing without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(supportedClipType()).toBeNull();
  });

  it('is nothing when a canvas can’t be turned into a video stream', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    expect(supportedClipType()).toBeNull();
  });

  it('asks the recorder which formats it takes', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: takes('video/webm') });
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      value: () => null,
      configurable: true,
    });
    expect(supportedClipType()?.extension).toBe('webm');
  });
});

describe('clipFileName', () => {
  const mp4: ClipType = { mimeType: 'video/mp4', container: 'video/mp4', extension: 'mp4' };
  const webm: ClipType = { mimeType: 'video/webm', container: 'video/webm', extension: 'webm' };

  it.each([
    ['John 3:16 · Bible SoyDeLaCruz-Reference', mp4, 'john-3-16-bible-soydelacruz-reference.mp4'],
    ['Gênesis 1 · Referências Cruzadas', webm, 'genesis-1-referencias-cruzadas.webm'],
    ['· ·', webm, 'bible-cross-references.webm'],
  ])('names %s as the file %s', (title, type, name) => {
    expect(clipFileName(title, type)).toBe(name);
  });
});

describe('canShareFile', () => {
  const file = new File(['clip'], 'clip.mp4', { type: 'video/mp4' });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('is false where the browser has no share sheet for files', () => {
    expect(canShareFile(file)).toBe(false);
  });

  it('asks the share sheet whether it takes the file', () => {
    const canShare = vi.fn((data?: ShareData) => data?.files?.[0]?.type === 'video/mp4');
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
    expect(canShareFile(file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(canShareFile(new File(['clip'], 'clip.webm', { type: 'video/webm' }))).toBe(false);
  });
});
