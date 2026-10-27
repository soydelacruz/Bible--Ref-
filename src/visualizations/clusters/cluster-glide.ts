import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { ClusterLayout } from './cluster-layout.ts';

/** How long the dots take to glide from one layout to the next, e.g. when a book is opened. */
export const GLIDE_MS = 400;

/**
 * How long a highlight takes to swell in under the pointer. Pointing never stops, so it is quick
 * enough to go almost unnoticed: the eye reads it as a response, not as motion.
 */
export const HOVER_GROW_MS = 160;

/** The size a verse arriving in the picture grows from, as a share of its own. */
export const ARRIVAL_SCALE = 0.9;

/**
 * A timing function like CSS's `cubic-bezier(x1, y1, x2, y2)`: the time `x` in [0, 1] to the
 * progress at that time.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  // The curve's coordinates as polynomials in its parameter t, from (0, 0) to (1, 1).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const curveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const curveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method finds t for x in a few steps where the curve is steep; bisection, which
    // always converges, takes over where it is flat.
    let t = x;
    for (let step = 0; step < 8; step += 1) {
      const error = curveX(t) - x;
      if (Math.abs(error) < 1e-7) return curveY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    while (high - low > 1e-7) {
      if (curveX(t) < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return curveY(t);
  };
}

/**
 * The glide's curve, the bottom sheet's own (`cubic-bezier(0.32, 0.72, 0, 1)`): away at once,
 * then a long settle, so the dots answer the click immediately and land softly.
 */
export const glideEase = cubicBezier(0.32, 0.72, 0, 1);

/** Ease-out cubic: the curve `animate()` in shared/frames.ts runs everything else on. */
export function easeOutCubic(linear: number): number {
  return 1 - (1 - linear) ** 3;
}

/**
 * The most one frame moves an animation on. A frame held up longer (by the page working out a new
 * layout, or collecting its garbage) pauses the motion rather than skipping most of it: a glide
 * that jumped from its start to two thirds of the way would be no glide at all.
 */
export const MAX_FRAME_STEP_MS = 50;

/**
 * Runs `onFrame(linear)` once a frame for `durationMs`, with `linear` the share of the time gone
 * by, in [0, 1], ending at exactly 1. Unlike `animate()` it leaves the easing to the caller, so one
 * clock can drive two curves of different lengths. Returns a function that stops it.
 */
export function playFrames(durationMs: number, onFrame: (linear: number) => void): () => void {
  let last = performance.now();
  let elapsed = 0;
  let frame = requestAnimationFrame(function step(now) {
    elapsed += Math.min(Math.max(now - last, 0), MAX_FRAME_STEP_MS);
    last = now;
    const linear = durationMs > 0 ? Math.min(elapsed / durationMs, 1) : 1;
    onFrame(linear);
    if (linear < 1) {
      frame = requestAnimationFrame(step);
    }
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}

/** A frame this long means the glide is not keeping up: ten frames a second or fewer. */
export const SLOW_FRAME_MS = 100;

/** How many slow frames in a row give a glide up: one is a hiccup, two is the machine. */
export const SLOW_FRAMES_TO_LAND = 2;

/**
 * Watches the pace of a glide's frames. Where the machine cannot draw them smoothly (no GPU worth
 * the name, or a software renderer) the glide lands at once: a slideshow of the picture moving is
 * worse than the picture simply changing.
 */
export class FramePace {
  #last: number;
  #slow = 0;

  constructor(now: number) {
    this.#last = now;
  }

  /** Notes a frame drawn at `now`; true once enough slow frames have come in a row. */
  tooSlow(now: number): boolean {
    this.#slow = now - this.#last >= SLOW_FRAME_MS ? this.#slow + 1 : 0;
    this.#last = now;
    return this.#slow >= SLOW_FRAMES_TO_LAND;
  }
}

/** A name or heading where the drawing put it, so a glide can move or fade it. */
export interface PlacedLabel {
  /** The same thing in two pictures has the same key: a book, a chapter, or a band's heading. */
  readonly key: string;
  readonly text: string;
  readonly kind: 'name' | 'chapter' | 'heading';
  readonly x: number;
  readonly y: number;
}

export interface ShownLabel extends PlacedLabel {
  readonly alpha: number;
}

/**
 * The labels part-way through a glide: one in both pictures moves from its old place to its new;
 * one in only the old fades out where it was, and one in only the new fades in where it lands.
 */
export function blendLabels(
  from: readonly PlacedLabel[],
  to: readonly PlacedLabel[],
  progress: number,
): ShownLabel[] {
  const identity = (label: PlacedLabel) => `${label.kind}\u0000${label.key}\u0000${label.text}`;
  const before = new Map(from.map((label) => [identity(label), label]));
  const shown: ShownLabel[] = [];
  const kept = new Set<string>();
  for (const label of to) {
    const old = before.get(identity(label));
    if (old) {
      kept.add(identity(label));
      shown.push({
        ...label,
        x: old.x + (label.x - old.x) * progress,
        y: old.y + (label.y - old.y) * progress,
        alpha: 1,
      });
    } else {
      shown.push({ ...label, alpha: progress });
    }
  }
  for (const label of from) {
    if (!kept.has(identity(label))) shown.push({ ...label, alpha: 1 - progress });
  }
  return shown;
}

/** What the base canvas shows: where its dots are drawn, its links, and its labels. */
export interface ShownScene {
  /** A layout whose `x` and `y` are where the dots are drawn, which mid-glide is not where the
   * layout put them. */
  readonly layout: ClusterLayout;
  readonly linkIds: Int32Array;
  readonly labels: readonly PlacedLabel[];
}

/** Links as pairs of slots (see `GlidePlan`). */
export interface LinkSlots {
  readonly from: Int32Array;
  readonly to: Int32Array;
}

/**
 * How to get from one picture to the next, worked out once so each frame only interpolates.
 *
 * Every dot is keyed by its verse, so a verse in both pictures is the same dot moving, not one dot
 * vanishing and another appearing. Dots live in slots: first the new layout's, by position in it,
 * then the verses leaving, which fade out where they were. A link's two ends are two slots, so a
 * link follows its dots wherever they go.
 */
export interface GlidePlan {
  /** The new layout's dot count: slots [0, count) are its dots. */
  readonly count: number;
  /** Where each of the new layout's dots starts: its old place, or its new one if it arrives. */
  readonly fromX: Float32Array;
  readonly fromY: Float32Array;
  /** Slots of the dots in both pictures, which move. */
  readonly kept: Int32Array;
  /** Slots of the dots only in the new picture, which grow and fade in where they land. */
  readonly arriving: Int32Array;
  /** The verses only in the old picture, with their places; their slots are `count + i`. */
  readonly leaving: Int32Array;
  readonly leavingX: Float32Array;
  readonly leavingY: Float32Array;
  /** The links in both pictures, in only the new one, and in only the old one. */
  readonly links: {
    readonly kept: LinkSlots;
    readonly arriving: LinkSlots;
    readonly leaving: LinkSlots;
  };
  readonly fromDotRadius: number;
  readonly toDotRadius: number;
}

/**
 * Pairs of slots, written into arrays as long as they could need to be: a glide out of the whole
 * Bible has well over a hundred thousand links, and growing plain arrays to that size leaves the
 * page a heap of garbage to collect while the glide is meant to be moving.
 */
class SlotPairs {
  readonly #from: Int32Array;
  readonly #to: Int32Array;
  #count = 0;

  constructor(capacity: number) {
    this.#from = new Int32Array(capacity);
    this.#to = new Int32Array(capacity);
  }

  add(from: number, to: number): void {
    this.#from[this.#count] = from;
    this.#to[this.#count] = to;
    this.#count += 1;
  }

  build(): LinkSlots {
    return { from: this.#from.subarray(0, this.#count), to: this.#to.subarray(0, this.#count) };
  }
}

/** The two verses a link joins (the drawing joins a link's source to its target's first verse). */
export interface LinkEnds {
  readonly sources: ArrayLike<VerseIndex>;
  readonly targetStarts: ArrayLike<VerseIndex>;
}

/**
 * Plans the glide from what is on screen to a new picture. Both pictures' `linkIds` are in dataset
 * order, as `selectClusterGraph` makes them, so the links they share are found in one pass.
 */
export function planGlide(from: ShownScene, to: ShownScene, ends: LinkEnds): GlidePlan {
  const target = to.layout;
  const count = target.nodes.length;
  const fromX = target.x.slice();
  const fromY = target.y.slice();
  const isKept = new Uint8Array(count);
  // The slot of each leaving verse, by verse; −1 for the rest.
  const leavingSlot = new Int32Array(target.nodeOf.length).fill(-1);
  const leaving: number[] = [];
  const leavingX: number[] = [];
  const leavingY: number[] = [];
  from.layout.nodes.forEach((verse, position) => {
    const x = elementAt(from.layout.x, position);
    const y = elementAt(from.layout.y, position);
    const slot = elementAt(target.nodeOf, verse);
    if (slot >= 0) {
      fromX[slot] = x;
      fromY[slot] = y;
      isKept[slot] = 1;
    } else {
      leavingSlot[verse] = count + leaving.length;
      leaving.push(verse);
      leavingX.push(x);
      leavingY.push(y);
    }
  });
  const kept: number[] = [];
  const arriving: number[] = [];
  isKept.forEach((flag, slot) => {
    (flag ? kept : arriving).push(slot);
  });

  const slotOf = (verse: VerseIndex) => {
    const slot = elementAt(target.nodeOf, verse);
    return slot >= 0 ? slot : elementAt(leavingSlot, verse);
  };
  const old = from.linkIds;
  const next = to.linkIds;
  const keptLinks = new SlotPairs(Math.min(old.length, next.length));
  const arrivingLinks = new SlotPairs(next.length);
  const leavingLinks = new SlotPairs(old.length);
  const add = (pairs: SlotPairs, id: number) => {
    pairs.add(slotOf(elementAt(ends.sources, id)), slotOf(elementAt(ends.targetStarts, id)));
  };
  let i = 0;
  let j = 0;
  while (i < old.length || j < next.length) {
    const a = i < old.length ? elementAt(old, i) : Infinity;
    const b = j < next.length ? elementAt(next, j) : Infinity;
    if (a === b) {
      add(keptLinks, a);
      i += 1;
      j += 1;
    } else if (a < b) {
      add(leavingLinks, a);
      i += 1;
    } else {
      add(arrivingLinks, b);
      j += 1;
    }
  }

  return {
    count,
    fromX,
    fromY,
    kept: Int32Array.from(kept),
    arriving: Int32Array.from(arriving),
    leaving: Int32Array.from(leaving),
    leavingX: Float32Array.from(leavingX),
    leavingY: Float32Array.from(leavingY),
    links: {
      kept: keptLinks.build(),
      arriving: arrivingLinks.build(),
      leaving: leavingLinks.build(),
    },
    fromDotRadius: from.layout.dotRadius,
    toDotRadius: target.dotRadius,
  };
}

/**
 * Whether a glide would show nothing moving: the same dots in the same places, the same links. A
 * redraw that changes nothing (a filter that hides no drawn link) is then drawn at once.
 */
export function isStill(plan: GlidePlan, layout: ClusterLayout): boolean {
  if (plan.arriving.length > 0 || plan.leaving.length > 0) return false;
  if (plan.links.arriving.from.length > 0 || plan.links.leaving.from.length > 0) return false;
  if (plan.fromDotRadius !== plan.toDotRadius) return false;
  for (let slot = 0; slot < plan.count; slot += 1) {
    if (
      elementAt(plan.fromX, slot) !== elementAt(layout.x, slot) ||
      elementAt(plan.fromY, slot) !== elementAt(layout.y, slot)
    ) {
      return false;
    }
  }
  return true;
}

/** Dot centers by slot, for one frame of a glide (see `GlidePlan`). */
export interface GlideFrame {
  readonly x: Float32Array;
  readonly y: Float32Array;
}

/**
 * The positions one glide draws from, made once and rewritten every frame (no garbage per frame).
 * The leaving dots stay where they were, so their slots are filled here for good.
 */
export function createGlideFrame(plan: GlidePlan): GlideFrame {
  const length = plan.count + plan.leaving.length;
  const x = new Float32Array(length);
  const y = new Float32Array(length);
  x.set(plan.leavingX, plan.count);
  y.set(plan.leavingY, plan.count);
  return { x, y };
}

/** Moves every dot of the new layout `progress` of the way from where it starts to where it lands. */
export function writeGlideFrame(
  plan: GlidePlan,
  layout: ClusterLayout,
  progress: number,
  frame: GlideFrame,
): void {
  for (let slot = 0; slot < plan.count; slot += 1) {
    const x0 = elementAt(plan.fromX, slot);
    const y0 = elementAt(plan.fromY, slot);
    frame.x[slot] = x0 + (elementAt(layout.x, slot) - x0) * progress;
    frame.y[slot] = y0 + (elementAt(layout.y, slot) - y0) * progress;
  }
}

/** The dots' radius `progress` of the way through a glide (fewer dots are drawn larger). */
export function glideDotRadius(plan: GlidePlan, progress: number): number {
  return plan.fromDotRadius + (plan.toDotRadius - plan.fromDotRadius) * progress;
}

/**
 * The new layout as it stands mid-glide: its own dots and groups, drawn where the frame has them.
 * What is drawn over the picture (a passage's links) follows the dots through it.
 */
export function frameLayout(
  plan: GlidePlan,
  layout: ClusterLayout,
  frame: GlideFrame,
  progress: number,
): ClusterLayout {
  return {
    ...layout,
    x: frame.x.subarray(0, plan.count),
    y: frame.y.subarray(0, plan.count),
    dotRadius: glideDotRadius(plan, progress),
  };
}

/** What becomes of a dot through a glide, as the GPU is told it. */
export const GLIDE_ROLE = { kept: 0, arriving: 1, leaving: 2 } as const;

/** Numbers per slot in `glideVertices`: where it starts (x, y), where it ends, genre, role. */
export const SLOT_FLOATS = 6;

/**
 * Every slot of a glide, ready for the GPU in one upload: where its dot starts and ends, its
 * verse's genre and its role. The GPU then moves every dot itself; a frame sends it only how far
 * the glide has got, so it costs the same for ten dots as for thirty thousand.
 */
export function glideVertices(
  plan: GlidePlan,
  layout: ClusterLayout,
  verseGenres: Uint8Array,
): Float32Array {
  const vertices = new Float32Array((plan.count + plan.leaving.length) * SLOT_FLOATS);
  const put = (slot: number, x0: number, y0: number, x1: number, y1: number, verse: number) => {
    const at = slot * SLOT_FLOATS;
    vertices[at] = x0;
    vertices[at + 1] = y0;
    vertices[at + 2] = x1;
    vertices[at + 3] = y1;
    vertices[at + 4] = elementAt(verseGenres, verse);
  };
  for (let slot = 0; slot < plan.count; slot += 1) {
    put(
      slot,
      elementAt(plan.fromX, slot),
      elementAt(plan.fromY, slot),
      elementAt(layout.x, slot),
      elementAt(layout.y, slot),
      elementAt(layout.nodes, slot),
    );
    vertices[slot * SLOT_FLOATS + 5] = GLIDE_ROLE.kept;
  }
  for (const slot of plan.arriving) vertices[slot * SLOT_FLOATS + 5] = GLIDE_ROLE.arriving;
  plan.leaving.forEach((verse, i) => {
    const x = elementAt(plan.leavingX, i);
    const y = elementAt(plan.leavingY, i);
    const slot = plan.count + i;
    put(slot, x, y, x, y, verse);
    vertices[slot * SLOT_FLOATS + 5] = GLIDE_ROLE.leaving;
  });
  return vertices;
}

/**
 * The glide's links as pairs of slots in one index list: those kept, then those arriving, then
 * those leaving, each run drawn with its own strength.
 */
export interface GlideLinkIndices {
  readonly indices: Uint32Array;
  /** How many indices (two per link) each run has. */
  readonly kept: number;
  readonly arriving: number;
  readonly leaving: number;
}

export function glideLinkIndices(plan: GlidePlan): GlideLinkIndices {
  const runs = [plan.links.kept, plan.links.arriving, plan.links.leaving];
  const indices = new Uint32Array(runs.reduce((sum, run) => sum + run.from.length * 2, 0));
  let at = 0;
  for (const run of runs) {
    run.from.forEach((from, i) => {
      indices[at] = from;
      indices[at + 1] = elementAt(run.to, i);
      at += 2;
    });
  }
  return {
    indices,
    kept: plan.links.kept.from.length * 2,
    arriving: plan.links.arriving.from.length * 2,
    leaving: plan.links.leaving.from.length * 2,
  };
}
