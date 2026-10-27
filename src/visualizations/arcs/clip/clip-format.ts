import { fileSlug } from '../../shared/image-export.ts';

/** A video format the browser can record a clip in, and the kind of file that makes. */
export interface ClipType {
  /** What MediaRecorder is asked for, codecs and all. */
  readonly mimeType: string;
  /** The file's own type, without codecs: what a share sheet looks at. */
  readonly container: 'video/mp4' | 'video/webm';
  readonly extension: 'mp4' | 'webm';
}

const MP4 = { container: 'video/mp4', extension: 'mp4' } as const;
const WEBM = { container: 'video/webm', extension: 'webm' } as const;

/**
 * In order of preference. MP4 first: it plays wherever a clip is likely to be sent, iPhones
 * included, which play no WebM, and it is all Safari records. WebM for the browsers that record
 * no MP4: Firefox, and Chromium builds without H.264.
 */
const CANDIDATES: readonly ClipType[] = [
  { mimeType: 'video/mp4;codecs=avc1', ...MP4 },
  { mimeType: 'video/mp4', ...MP4 },
  { mimeType: 'video/webm;codecs=vp9', ...WEBM },
  { mimeType: 'video/webm;codecs=vp8', ...WEBM },
  { mimeType: 'video/webm', ...WEBM },
];

/** The first format the recorder takes, or `null` if it takes none of them. */
export function chooseClipType(isTypeSupported: (mimeType: string) => boolean): ClipType | null {
  return CANDIDATES.find((type) => isTypeSupported(type.mimeType)) ?? null;
}

/**
 * The format this browser records clips of a canvas in, or `null` where it can't: no
 * MediaRecorder (older browsers), or no way to turn a canvas into a video stream.
 */
export function supportedClipType(): ClipType | null {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    !('captureStream' in HTMLCanvasElement.prototype)
  ) {
    return null;
  }
  return chooseClipType((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

/** A file name from the clip's title, like the picture's: `john-3-16-bible-cross-references.mp4`. */
export function clipFileName(title: string, type: ClipType): string {
  return `${fileSlug(title)}.${type.extension}`;
}

/** Whether the system's share sheet takes the file: on phones, mostly; elsewhere it is saved. */
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}
