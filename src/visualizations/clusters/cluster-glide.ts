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

function labelAlpha(label: PlacedLabel | ShownLabel): number {
  return 'alpha' in label ? label.alpha : 1;
}

/**
 * The labels part-way through a glide: one in both pictures moves from its old place to its new;
 * one in only the old fades out where it was, and one in only the new fades in where it lands.
 * A label already part-faded (a glide cut short by this one) carries on from where it was.
 */
export function blendLabels(
  from: readonly (PlacedLabel | ShownLabel)[],
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
      const alpha = labelAlpha(old);
      shown.push({
        ...label,
        x: old.x + (label.x - old.x) * progress,
        y: old.y + (label.y - old.y) * progress,
        alpha: alpha + (1 - alpha) * progress,
      });
    } else {
      shown.push({ ...label, alpha: progress });
    }
  }
  for (const label of from) {
    if (!kept.has(identity(label))) {
      shown.push({ ...label, alpha: labelAlpha(label) * (1 - progress) });
    }
  }
  return shown;
}

/** Dots still fading out of the picture: their verses, places and opacities, by position. */
export interface FadingDots {
  readonly nodes: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly alpha: Float32Array;
}

/** What the base canvas shows: where its dots are drawn, its links, and its labels. */
export interface ShownScene {
  /** A layout whose `x` and `y` are where the dots are drawn, which mid-glide is not where the
   * layout put them. */
  readonly layout: ClusterLayout;
  readonly linkIds: Int32Array;
  readonly labels: readonly (PlacedLabel | ShownLabel)[];
  /** Mid-glide, how opaque each of the layout's dots is (those arriving are part-way in). */
  readonly alpha?: Float32Array;
  /** Mid-glide, the dots of the picture before that are still fading out. */
  readonly leaving?: FadingDots;
  /** Mid-glide, how strong each of `linkIds` is drawn (at rest, all at the haze's strength). */
  readonly linkAlpha?: Float32Array;
  /** Mid-glide, the links of the picture before that are still fading out, and how strong. */
  readonly fadingLinks?: { readonly ids: Int32Array; readonly alpha: Float32Array };
}

/**
 * Links as pairs of slots (see `GlidePlan`), and how strong each is drawn at the start of the
 * glide: the haze's strength for one drawn at rest, 0 for one arriving, and in between for one a
 * glide cut short had left part-way in or out.
 */
export interface LinkRun {
  readonly from: Int32Array;
  readonly to: Int32Array;
  readonly start: Float32Array;
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
  /**
   * How opaque each slot's dot starts: 1 for one fully drawn, 0 for one arriving, and in between
   * for one a glide cut short had left part-way in or out.
   */
  readonly fromAlpha: Float32Array;
  /** The new picture's links, one for each of its `linkIds`, in order; they end at `linkStrength`. */
  readonly links: LinkRun;
  /** The links only on screen before, by ID in dataset order; they fade out to nothing. */
  readonly leavingLinks: LinkRun & { readonly ids: Int32Array };
  /** How strong the new picture's links are drawn once it is at rest. */
  readonly linkStrength: number;
  readonly fromDotRadius: number;
  readonly toDotRadius: number;
}

/**
 * Links, written into arrays as long as they could need to be: a glide out of the whole Bible has
 * well over a hundred thousand of them, and growing plain arrays to that size leaves the page a
 * heap of garbage to collect while the glide is meant to be moving.
 */
class LinkRunBuilder {
  readonly #from: Int32Array;
  readonly #to: Int32Array;
  readonly #start: Float32Array;
  readonly #ids: Int32Array;
  #count = 0;

  constructor(capacity: number) {
    this.#from = new Int32Array(capacity);
    this.#to = new Int32Array(capacity);
    this.#start = new Float32Array(capacity);
    this.#ids = new Int32Array(capacity);
  }

  add(id: number, from: number, to: number, start: number): void {
    this.#from[this.#count] = from;
    this.#to[this.#count] = to;
    this.#start[this.#count] = start;
    this.#ids[this.#count] = id;
    this.#count += 1;
  }

  build(): LinkRun & { readonly ids: Int32Array } {
    const end = this.#count;
    return {
      from: this.#from.subarray(0, end),
      to: this.#to.subarray(0, end),
      start: this.#start.subarray(0, end),
      ids: this.#ids.subarray(0, end),
    };
  }
}

/** How strong the links of two pictures are drawn at rest (see `hazeAlpha` in the drawing). */
export interface GlideHaze {
  readonly from: number;
  readonly to: number;
}

/** The two verses a link joins (the drawing joins a link's source to its target's first verse). */
export interface LinkEnds {
  readonly sources: ArrayLike<VerseIndex>;
  readonly targetStarts: ArrayLike<VerseIndex>;
}

/**
 * Plans the glide from what is on screen to a new picture: from the picture at rest, or from
 * wherever a glide this one cuts short had got to, its fading dots and links included. Every set
 * of links is in dataset order, as `selectClusterGraph` makes them, so the links they share are
 * found in one pass.
 */
export function planGlide(
  from: ShownScene,
  to: ShownScene,
  ends: LinkEnds,
  haze: GlideHaze,
): GlidePlan {
  const target = to.layout;
  const count = target.nodes.length;
  const fromX = target.x.slice();
  const fromY = target.y.slice();
  // Every dot of the new layout starts unseen, until it turns out to be on screen already.
  const keptAlpha = new Float32Array(count);
  const isKept = new Uint8Array(count);
  // The slot of each leaving verse, by verse; −1 for the rest.
  const leavingSlot = new Int32Array(target.nodeOf.length).fill(-1);
  const leaving: number[] = [];
  const leavingX: number[] = [];
  const leavingY: number[] = [];
  const leavingAlpha: number[] = [];
  const visit = (verse: number, x: number, y: number, alpha: number) => {
    const slot = elementAt(target.nodeOf, verse);
    if (slot >= 0) {
      fromX[slot] = x;
      fromY[slot] = y;
      keptAlpha[slot] = alpha;
      isKept[slot] = 1;
    } else {
      leavingSlot[verse] = count + leaving.length;
      leaving.push(verse);
      leavingX.push(x);
      leavingY.push(y);
      leavingAlpha.push(alpha);
    }
  };
  const { layout: shown, alpha, leaving: fading } = from;
  shown.nodes.forEach((verse, position) => {
    const opacity = alpha ? elementAt(alpha, position) : 1;
    visit(verse, elementAt(shown.x, position), elementAt(shown.y, position), opacity);
  });
  fading?.nodes.forEach((verse, i) => {
    visit(verse, elementAt(fading.x, i), elementAt(fading.y, i), elementAt(fading.alpha, i));
  });
  const kept: number[] = [];
  const arriving: number[] = [];
  isKept.forEach((flag, slot) => {
    (flag ? kept : arriving).push(slot);
  });
  const fromAlpha = new Float32Array(count + leaving.length);
  fromAlpha.set(keptAlpha);
  fromAlpha.set(leavingAlpha, count);

  const slotOf = (verse: VerseIndex) => {
    const slot = elementAt(target.nodeOf, verse);
    return slot >= 0 ? slot : elementAt(leavingSlot, verse);
  };
  // The links on screen (drawn, and still fading out of the picture before) against the new
  // picture's: each gets the strength it is drawn at now, 0 for one not yet on screen.
  const drawn = from.linkIds;
  const fadingLinks = from.fadingLinks ?? { ids: new Int32Array(0), alpha: new Float32Array(0) };
  const fadingIds = fadingLinks.ids;
  const next = to.linkIds;
  const strengthOf = (i: number) => (from.linkAlpha ? elementAt(from.linkAlpha, i) : haze.from);
  const links = new LinkRunBuilder(next.length);
  const leavingLinks = new LinkRunBuilder(drawn.length + fadingIds.length);
  const idAt = (ids: Int32Array, i: number) => (i < ids.length ? elementAt(ids, i) : Infinity);
  let i = 0;
  let f = 0;
  let j = 0;
  while (i < drawn.length || f < fadingIds.length || j < next.length) {
    const id = Math.min(idAt(drawn, i), idAt(fadingIds, f), idAt(next, j));
    let start = 0;
    if (idAt(drawn, i) === id) {
      start = strengthOf(i);
      i += 1;
    } else if (idAt(fadingIds, f) === id) {
      start = elementAt(fadingLinks.alpha, f);
      f += 1;
    }
    const ends0 = slotOf(elementAt(ends.sources, id));
    const ends1 = slotOf(elementAt(ends.targetStarts, id));
    if (idAt(next, j) === id) {
      links.add(id, ends0, ends1, start);
      j += 1;
    } else {
      leavingLinks.add(id, ends0, ends1, start);
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
    fromAlpha,
    links: links.build(),
    leavingLinks: leavingLinks.build(),
    linkStrength: haze.to,
    fromDotRadius: from.layout.dotRadius,
    toDotRadius: target.dotRadius,
  };
}

/**
 * Whether a glide would show nothing moving: the same dots in the same places, as opaque as at
 * rest, and the same links as strong. A redraw that changes nothing (a filter that hides no drawn
 * link) is then drawn at once.
 */
export function isStill(plan: GlidePlan, layout: ClusterLayout): boolean {
  if (plan.arriving.length > 0 || plan.leaving.length > 0) return false;
  if (plan.leavingLinks.from.length > 0) return false;
  // Strengths are kept at the GPU's precision, so they are compared at it.
  const strength = Math.fround(plan.linkStrength);
  if (plan.links.start.some((start) => start !== strength)) return false;
  if (plan.fromDotRadius !== plan.toDotRadius) return false;
  for (let slot = 0; slot < plan.count; slot += 1) {
    if (
      elementAt(plan.fromX, slot) !== elementAt(layout.x, slot) ||
      elementAt(plan.fromY, slot) !== elementAt(layout.y, slot) ||
      elementAt(plan.fromAlpha, slot) !== 1
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

/**
 * Numbers per slot in `glideVertices`: where it starts (x, y), where it ends, genre, role, and
 * how opaque it starts.
 */
export const SLOT_FLOATS = 7;

/**
 * Every slot of a glide, ready for the GPU in one upload: where its dot starts and ends, its
 * verse's genre, its role and its opacity at the start. The GPU then moves every dot itself; a
 * frame sends it only how far the glide has got, so it costs the same for ten dots as for thirty
 * thousand.
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
  plan.fromAlpha.forEach((alpha, slot) => {
    vertices[slot * SLOT_FLOATS + 6] = alpha;
  });
  return vertices;
}

/** How opaque a slot's dot is `progress` of the way through a glide (the shader's own rule). */
export function slotAlpha(plan: GlidePlan, slot: number, progress: number): number {
  const start = elementAt(plan.fromAlpha, slot);
  return slot >= plan.count ? start * (1 - progress) : start + (1 - start) * progress;
}

/**
 * What a glide cut short leaves on screen, for the glide that interrupts it to set off from:
 * every dot where it is and as opaque as it is, the dots and links still fading out, and the
 * names part-way between their places. Taken once, when the glide is cut short, not every frame.
 */
export function sceneMidGlide(
  plan: GlidePlan,
  from: ShownScene,
  to: ShownScene,
  frame: GlideFrame,
  progress: number,
): ShownScene {
  const alpha = new Float32Array(plan.count);
  for (let slot = 0; slot < plan.count; slot += 1) alpha[slot] = slotAlpha(plan, slot, progress);
  const leavingAlpha = new Float32Array(plan.leaving.length);
  plan.leaving.forEach((_, i) => {
    leavingAlpha[i] = slotAlpha(plan, plan.count + i, progress);
  });
  const { links, leavingLinks, linkStrength } = plan;
  return {
    layout: frameLayout(plan, to.layout, frame, progress),
    linkIds: to.linkIds,
    labels: blendLabels(from.labels, to.labels, progress),
    alpha,
    leaving: { nodes: plan.leaving, x: plan.leavingX, y: plan.leavingY, alpha: leavingAlpha },
    linkAlpha: links.start.map((start) => start + (linkStrength - start) * progress),
    fadingLinks: {
      ids: leavingLinks.ids,
      alpha: leavingLinks.start.map((start) => start * (1 - progress)),
    },
  };
}

/**
 * Numbers per end of a link in `glideLineVertices`: where it starts (x, y), where it ends, and how
 * strong the link is drawn at the start and at the end of the glide.
 */
export const LINE_FLOATS = 6;

/**
 * Every link of a glide, ready for the GPU in one upload, as its two ends: the new picture's links,
 * which end at full strength, then those leaving, which end at nothing. Each link keeps its own
 * strength at the start, so one a glide cut short had left half faded carries on from there.
 */
export function glideLineVertices(plan: GlidePlan, layout: ClusterLayout): Float32Array {
  const { links, leavingLinks } = plan;
  const vertices = new Float32Array(
    (links.from.length + leavingLinks.from.length) * 2 * LINE_FLOATS,
  );
  let at = 0;
  const put = (slot: number, start: number, end: number) => {
    const kept = slot < plan.count;
    const x0 = kept ? elementAt(plan.fromX, slot) : elementAt(plan.leavingX, slot - plan.count);
    const y0 = kept ? elementAt(plan.fromY, slot) : elementAt(plan.leavingY, slot - plan.count);
    vertices[at] = x0;
    vertices[at + 1] = y0;
    vertices[at + 2] = kept ? elementAt(layout.x, slot) : x0;
    vertices[at + 3] = kept ? elementAt(layout.y, slot) : y0;
    vertices[at + 4] = start;
    vertices[at + 5] = end;
    at += LINE_FLOATS;
  };
  for (const [run, end] of [
    [links, plan.linkStrength],
    [leavingLinks, 0],
  ] as const) {
    run.from.forEach((from, i) => {
      const start = elementAt(run.start, i);
      put(from, start, end);
      put(elementAt(run.to, i), start, end);
    });
  }
  return vertices;
}
