/** Frames per second of the clip: smooth growth, and few enough frames for a phone to encode. */
export const CLIP_FPS = 30;

/** The axis and the passage alone first, long enough to see where on the Bible it is. */
const LEAD_IN_MS = 400;
/** The links have finished growing by LEAD_IN_MS plus this, however many there are. */
const GROW_WINDOW_MS = 4200;
/** The whole picture, still, at the end: long enough to read before the clip loops. */
const HOLD_MS = 1400;
/** A clip shorter than this ends before a viewer has found the passage. */
const MIN_DURATION_MS = 4000;
/** One link's growth, at its slowest: with a few links, each is seen to rise. */
const MAX_GROW_MS = 700;
/** The longest wait between two links, so a passage with few of them doesn't dawdle. */
const MAX_STAGGER_MS = 350;
/**
 * At most this many links grow at once, whatever the passage: a chapter's thousand links grow
 * faster rather than in a crowd, which keeps the work of one frame bounded on a phone.
 */
const MAX_GROWING = 48;

/**
 * When each link of the clip grows. They grow one after another, in order, each for the same
 * time, so the links before a frame's growing ones have all landed.
 */
export interface ClipTimeline {
  readonly linkCount: number;
  /** Between 4 and 6 seconds. */
  readonly durationMs: number;
  readonly frameCount: number;
  /** How long each link takes to grow. */
  readonly growMs: number;
  /** Between the starts of two links in a row. */
  readonly staggerMs: number;
}

export function clipTimeline(linkCount: number): ClipTimeline {
  const count = Math.max(0, Math.floor(linkCount));
  // Growing for MAX_GROWING staggers, the last link lands at the window's end when
  // (count - 1) staggers and MAX_GROWING more fill it.
  const growMs =
    count === 0
      ? 0
      : Math.min(MAX_GROW_MS, (MAX_GROWING * GROW_WINDOW_MS) / (count - 1 + MAX_GROWING));
  const staggerMs =
    count > 1 ? Math.min(MAX_STAGGER_MS, (GROW_WINDOW_MS - growMs) / (count - 1)) : 0;
  const grownMs = count === 0 ? LEAD_IN_MS : LEAD_IN_MS + (count - 1) * staggerMs + growMs;
  // In whole milliseconds: a rounding error past 6 s would add a frame.
  const durationMs = Math.max(MIN_DURATION_MS, Math.round(grownMs + HOLD_MS));
  return {
    linkCount: count,
    durationMs,
    frameCount: Math.ceil((durationMs * CLIP_FPS) / 1000),
    growMs,
    staggerMs,
  };
}

/** When a frame is shown, from the clip's start. */
export function frameTimeMs(frame: number): number {
  return (frame * 1000) / CLIP_FPS;
}

/** The same ease-out curve as `animate()` in `shared/frames.ts`: quick off the axis, soft landing. */
function easeOut(linear: number): number {
  return 1 - (1 - linear) ** 3;
}

/** How far a link has grown at a time: 0 until its turn, 1 once it has landed. */
export function linkGrowth(timeline: ClipTimeline, index: number, timeMs: number): number {
  const elapsed = timeMs - LEAD_IN_MS - index * timeline.staggerMs;
  if (elapsed <= 0) {
    return 0;
  }
  if (elapsed >= timeline.growMs) {
    return 1;
  }
  return easeOut(elapsed / timeline.growMs);
}

/**
 * What a frame shows, as counts of links in the clip's order: the first `landed` have finished
 * growing, and those from `landed` up to `started` are growing.
 */
export interface FramePhase {
  readonly landed: number;
  readonly started: number;
}

export function framePhase(timeline: ClipTimeline, timeMs: number): FramePhase {
  const { linkCount, growMs, staggerMs } = timeline;
  const sinceFirstStart = timeMs - LEAD_IN_MS;
  const sinceFirstLanding = sinceFirstStart - growMs;
  // A link has started once its turn has passed (at its turn it has not grown at all), and has
  // landed from the moment its growth is done — the same edges as `linkGrowth`.
  const started =
    sinceFirstStart <= 0
      ? 0
      : staggerMs === 0
        ? linkCount
        : Math.min(linkCount, Math.ceil(sinceFirstStart / staggerMs));
  const landed =
    sinceFirstLanding < 0
      ? 0
      : staggerMs === 0
        ? linkCount
        : Math.min(linkCount, Math.floor(sinceFirstLanding / staggerMs) + 1);
  return { landed, started };
}
