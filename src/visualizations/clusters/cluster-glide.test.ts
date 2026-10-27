import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { createCrossReferenceColumns, verseIndex } from '../../test-utils/fixtures.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER, type LinkFilter } from '../shared/link-filter.ts';
import { computeVerseGenres } from '../shared/verse-genres.ts';
import {
  blendLabels,
  createGlideFrame,
  cubicBezier,
  easeOutCubic,
  frameLayout,
  FramePace,
  GLIDE_ROLE,
  glideDotRadius,
  glideEase,
  glideLinkIndices,
  glideVertices,
  isStill,
  MAX_FRAME_STEP_MS,
  planGlide,
  playFrames,
  SLOT_FLOATS,
  SLOW_FRAME_MS,
  SLOW_FRAMES_TO_LAND,
  writeGlideFrame,
  type GlidePlan,
  type LinkSlots,
  type PlacedLabel,
  type ShownScene,
} from './cluster-glide.ts';
import { computeClusterLayout, selectClusterGraph } from './cluster-layout.ts';

const versification = CANONICAL_VERSIFICATION;
const verseGenres = computeVerseGenres(versification);
const GEN_1_1 = verseIndex('Gen', 1, 1);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const PS_23_1 = verseIndex('Ps', 23, 1);
const ISA_53_5 = verseIndex('Isa', 53, 5);
const JOHN_1_1 = verseIndex('John', 1, 1);
const JOHN_3_16 = verseIndex('John', 3, 16);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);

const index = new CrossReferenceIndex(
  createCrossReferenceColumns([
    { from: GEN_1_1, to: JOHN_1_1, votes: 90 },
    { from: GEN_3_15, to: ROM_16_20, votes: 40 },
    { from: GEN_3_15, to: REV_12_9, votes: 12 },
    { from: PS_23_1, to: ISA_53_5, votes: 5 },
    { from: JOHN_3_16, to: ISA_53_5, votes: 2 },
    { from: JOHN_1_1, to: GEN_1_1, votes: -3 },
  ]),
  versification.verseCount,
);

const SIZE = { width: 1200, height: 800 };

/** The picture at rest for a book (or the whole Bible) and a filter. */
function sceneOf(
  openBook: 'Gen' | null,
  filter: LinkFilter = DEFAULT_LINK_FILTER,
  size = SIZE,
): ShownScene {
  const graph = selectClusterGraph(index, verseGenres, filter, versification, openBook);
  const layout = computeClusterLayout(graph, versification, openBook, size);
  return { layout, linkIds: graph.linkIds, labels: [] };
}

/** The verses a plan's link slots join, a slot being a new dot or a leaving one. */
function linkVerses(plan: GlidePlan, to: ShownScene, slots: LinkSlots): [number, number][] {
  const verseOf = (slot: number) =>
    slot < plan.count ? (to.layout.nodes[slot] ?? -1) : (plan.leaving[slot - plan.count] ?? -1);
  return [...slots.from].map((from, i) => [verseOf(from), verseOf(slots.to[i] ?? -1)]);
}

describe('cubicBezier', () => {
  /** The curve's progress at time x, by bisecting its parameter: slow, but plainly right. */
  function reference(x1: number, y1: number, x2: number, y2: number, x: number): number {
    const at = (p0: number, p1: number, t: number) =>
      3 * (1 - t) ** 2 * t * p0 + 3 * (1 - t) * t ** 2 * p1 + t ** 3;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 60; step += 1) {
      const mid = (low + high) / 2;
      if (at(x1, x2, mid) < x) low = mid;
      else high = mid;
    }
    return at(y1, y2, (low + high) / 2);
  }

  it('starts at 0 and ends at 1, whatever lies outside', () => {
    const ease = cubicBezier(0.32, 0.72, 0, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  });

  it('is the identity for a straight line', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0.1, 0.37, 0.5, 0.92]) expect(linear(x)).toBeCloseTo(x, 6);
  });

  it('matches the curve CSS draws for the same four numbers', () => {
    for (const [x1, y1, x2, y2] of [
      [0.32, 0.72, 0, 1],
      [0.16, 1, 0.3, 1],
      [0.42, 0, 0.58, 1],
    ] as const) {
      const ease = cubicBezier(x1, y1, x2, y2);
      for (const x of [0.05, 0.2, 0.5, 0.75, 0.99]) {
        expect(ease(x)).toBeCloseTo(reference(x1, y1, x2, y2, x), 5);
      }
    }
  });

  it('still finds its way where the curve goes flat in time', () => {
    // This curve stands still in x half way along, where Newton's method has no slope to follow.
    const ease = cubicBezier(1, 0, 0, 1);
    for (const x of [0.5001, 0.4999, 0.3]) {
      expect(ease(x)).toBeCloseTo(reference(1, 0, 0, 1, x), 5);
    }
  });
});

describe('glideEase', () => {
  it('moves off quickly and settles slowly, never going backwards or past the end', () => {
    expect(glideEase(0.2)).toBeGreaterThan(0.45);
    expect(glideEase(0.5)).toBeGreaterThan(0.85);
    let previous = 0;
    for (let x = 0; x <= 1; x += 0.01) {
      const progress = glideEase(x);
      expect(progress).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(progress).toBeLessThanOrEqual(1);
      previous = progress;
    }
  });
});

describe('easeOutCubic', () => {
  it('is the curve the rest of the app animates on', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(1 - 0.5 ** 3, 10);
    expect(easeOutCubic(1)).toBe(1);
  });
});

describe('playFrames', () => {
  let frames: FrameRequestCallback[] = [];
  let now = 1000;

  beforeEach(() => {
    frames = [];
    now = 1000;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function frameAt(time: number): void {
    now = time;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(time);
  }

  it('hands each frame the share of the time gone by, without easing it', () => {
    const seen: number[] = [];
    playFrames(400, (linear) => seen.push(linear));
    frameAt(1040);
    frameAt(1080);
    expect(seen).toEqual([0.1, 0.2]);
  });

  it('ends at exactly 1 and asks for no more frames', () => {
    const seen: number[] = [];
    playFrames(100, (linear) => seen.push(linear));
    frameAt(1050);
    frameAt(1100);
    frameAt(1150);
    expect(seen).toEqual([0.5, 1]);
    expect(frames).toHaveLength(0);
  });

  it('pauses through a long stall rather than skipping ahead', () => {
    const seen: number[] = [];
    playFrames(400, (linear) => seen.push(linear));
    frameAt(1300); // held up for 300ms: moves on only one frame's worth
    expect(seen).toEqual([MAX_FRAME_STEP_MS / 400]);
    frameAt(1340);
    expect(seen[1]).toBeCloseTo((MAX_FRAME_STEP_MS + 40) / 400, 10);
  });

  it('finishes at once when there is no time to take', () => {
    const seen: number[] = [];
    playFrames(0, (linear) => seen.push(linear));
    frameAt(1000);
    expect(seen).toEqual([1]);
  });

  it('never runs backwards from a frame stamped before it started', () => {
    const seen: number[] = [];
    playFrames(400, (linear) => seen.push(linear));
    frameAt(990);
    expect(seen).toEqual([0]);
  });

  it('stops when cancelled', () => {
    const onFrame = vi.fn();
    const stop = playFrames(400, onFrame);
    frameAt(1020);
    stop();
    frameAt(1040);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });
});

describe('FramePace', () => {
  it('lets a glide run at any pace a reader would call smooth', () => {
    const pace = new FramePace(0);
    for (let now = 16; now < 1000; now += 16) expect(pace.tooSlow(now)).toBe(false);
  });

  it('forgives one slow frame, a hiccup, as long as the next is quick', () => {
    const pace = new FramePace(0);
    expect(pace.tooSlow(SLOW_FRAME_MS + 50)).toBe(false);
    expect(pace.tooSlow(SLOW_FRAME_MS + 66)).toBe(false);
    expect(pace.tooSlow(2 * SLOW_FRAME_MS + 100)).toBe(false);
  });

  it('gives up after slow frames in a row, as on a machine drawing without a GPU', () => {
    const pace = new FramePace(0);
    let now = 0;
    const results: boolean[] = [];
    for (let frame = 0; frame < SLOW_FRAMES_TO_LAND; frame += 1) {
      now += 600;
      results.push(pace.tooSlow(now));
    }
    expect(results.at(-1)).toBe(true);
    expect(results.slice(0, -1).every((tooSlow) => !tooSlow)).toBe(true);
  });
});

describe('blendLabels', () => {
  const label = (key: string, x: number, text = key): PlacedLabel => ({
    key,
    text,
    kind: 'name',
    x,
    y: 10,
  });

  it('moves a label that is in both pictures, at full strength', () => {
    const [moved] = blendLabels([label('Gen', 100)], [label('Gen', 300)], 0.25);
    expect(moved).toMatchObject({ key: 'Gen', x: 150, alpha: 1 });
  });

  it('fades out a label of the old picture where it was, and fades in one of the new', () => {
    const shown = blendLabels([label('Gen', 100)], [label('Exod', 300)], 0.25);
    expect(shown).toContainEqual(expect.objectContaining({ key: 'Gen', x: 100, alpha: 0.75 }));
    expect(shown).toContainEqual(expect.objectContaining({ key: 'Exod', x: 300, alpha: 0.25 }));
  });

  it('crossfades a label whose words changed, rather than sliding one word into another', () => {
    const shown = blendLabels([label('Gen', 100, 'Genesis')], [label('Gen', 100, 'Gn')], 0.5);
    expect(shown.map(({ text, alpha }) => [text, alpha])).toEqual([
      ['Gn', 0.5],
      ['Genesis', 0.5],
    ]);
  });

  it('tells a heading from a name with the same key', () => {
    const heading: PlacedLabel = { ...label('Gen', 100), kind: 'heading' };
    const shown = blendLabels([heading], [label('Gen', 100)], 0.5);
    expect(shown).toHaveLength(2);
  });
});

describe('planGlide', () => {
  describe('opening a book', () => {
    const from = sceneOf(null);
    const to = sceneOf('Gen');
    const plan = planGlide(from, to, index);

    it('keeps every verse that stays as the same dot, starting where it was', () => {
      expect(plan.count).toBe(to.layout.nodes.length);
      expect(plan.arriving).toHaveLength(0);
      expect(plan.kept).toHaveLength(plan.count);
      for (const verse of [GEN_1_1, GEN_3_15, JOHN_1_1, ROM_16_20, REV_12_9]) {
        const slot = to.layout.nodeOf[verse] ?? -1;
        const old = from.layout.nodeOf[verse] ?? -1;
        expect(plan.fromX[slot]).toBe(from.layout.x[old]);
        expect(plan.fromY[slot]).toBe(from.layout.y[old]);
      }
    });

    it('lets the verses the book does not reach fade out where they were', () => {
      expect([...plan.leaving]).toEqual([PS_23_1, ISA_53_5]);
      expect(plan.leavingX[0]).toBe(from.layout.x[from.layout.nodeOf[PS_23_1] ?? -1]);
      expect(plan.leavingY[1]).toBe(from.layout.y[from.layout.nodeOf[ISA_53_5] ?? -1]);
    });

    it('sorts the links into those that stay and those that go, each joining its own dots', () => {
      expect(linkVerses(plan, to, plan.links.kept)).toEqual([
        [GEN_1_1, JOHN_1_1],
        [GEN_3_15, ROM_16_20],
        [GEN_3_15, REV_12_9],
      ]);
      expect(linkVerses(plan, to, plan.links.leaving)).toEqual([[PS_23_1, ISA_53_5]]);
      expect(plan.links.arriving.from).toHaveLength(0);
    });

    it('grows the dots as there are fewer of them', () => {
      expect(plan.fromDotRadius).toBe(from.layout.dotRadius);
      expect(plan.toDotRadius).toBe(to.layout.dotRadius);
    });
  });

  it('brings verses in when a book is closed, growing in where they land', () => {
    const from = sceneOf('Gen');
    const to = sceneOf(null);
    const plan = planGlide(from, to, index);
    const arriving = [...plan.arriving].map((slot) => to.layout.nodes[slot]);
    expect(arriving).toEqual([PS_23_1, ISA_53_5]);
    for (const slot of plan.arriving) {
      expect(plan.fromX[slot]).toBe(to.layout.x[slot]);
      expect(plan.fromY[slot]).toBe(to.layout.y[slot]);
    }
    expect(plan.leaving).toHaveLength(0);
    expect(linkVerses(plan, to, plan.links.arriving)).toEqual([[PS_23_1, ISA_53_5]]);
  });

  it('ties a leaving link to a dot that stays at one end and one that goes at the other', () => {
    // Raising the filter drops John 3:16 and its one link, which lands on a verse that stays.
    const from = sceneOf(null, createLinkFilter(-Infinity));
    const to = sceneOf(null);
    const plan = planGlide(from, to, index);
    expect([...plan.leaving]).toEqual([JOHN_3_16]);
    const leaving = linkVerses(plan, to, plan.links.leaving);
    expect(leaving).toContainEqual([JOHN_3_16, ISA_53_5]);
    expect(leaving).toContainEqual([JOHN_1_1, GEN_1_1]);
    const john = leaving.findIndex(([from]) => from === JOHN_3_16);
    expect(plan.links.leaving.from[john]).toBe(plan.count);
    expect(plan.links.leaving.to[john]).toBe(to.layout.nodeOf[ISA_53_5]);
  });

  it('carries on from wherever a glide it interrupts had got to', () => {
    const start = sceneOf(null);
    const middle = sceneOf('Gen');
    const first = planGlide(start, middle, index);
    const frame = createGlideFrame(first);
    writeGlideFrame(first, middle.layout, 0.5, frame);
    const shown: ShownScene = {
      layout: frameLayout(first, middle.layout, frame, 0.5),
      linkIds: middle.linkIds,
      labels: [],
    };
    const second = planGlide(shown, start, index);
    const slot = start.layout.nodeOf[GEN_1_1] ?? -1;
    const halfway = middle.layout.nodeOf[GEN_1_1] ?? -1;
    expect(second.fromX[slot]).toBe(frame.x[halfway]);
    expect(second.fromDotRadius).toBeCloseTo(
      (start.layout.dotRadius + middle.layout.dotRadius) / 2,
      6,
    );
  });
});

describe('isStill', () => {
  it('sees nothing to move between a picture and itself', () => {
    const scene = sceneOf(null);
    expect(isStill(planGlide(scene, scene, index), scene.layout)).toBe(true);
  });

  it('sees motion when verses come or go, or the stage changes size', () => {
    expect(isStill(planGlide(sceneOf(null), sceneOf('Gen'), index), sceneOf('Gen').layout)).toBe(
      false,
    );
    const wide = sceneOf(null);
    const narrow = sceneOf(null, DEFAULT_LINK_FILTER, { width: 900, height: 800 });
    expect(isStill(planGlide(wide, narrow, index), narrow.layout)).toBe(false);
  });

  it('sees motion in links alone, or in the size of the dots alone', () => {
    const scene = sceneOf(null);
    const fewer: ShownScene = { ...scene, linkIds: scene.linkIds.slice(1) };
    expect(isStill(planGlide(scene, fewer, index), scene.layout)).toBe(false);
    const larger: ShownScene = {
      ...scene,
      layout: { ...scene.layout, dotRadius: scene.layout.dotRadius * 2 },
    };
    expect(isStill(planGlide(scene, larger, index), larger.layout)).toBe(false);
  });

  it('sees motion in a single dot moving down the page', () => {
    const scene = sceneOf(null);
    const y = scene.layout.y.slice();
    y[0] = (y[0] ?? 0) + 1;
    const moved: ShownScene = { ...scene, layout: { ...scene.layout, y } };
    expect(isStill(planGlide(scene, moved, index), moved.layout)).toBe(false);
  });
});

describe('a glide frame', () => {
  const from = sceneOf(null);
  const to = sceneOf('Gen');
  const plan = planGlide(from, to, index);

  it('starts where the old picture was and ends where the new one is', () => {
    const frame = createGlideFrame(plan);
    writeGlideFrame(plan, to.layout, 0, frame);
    expect([...frame.x.subarray(0, plan.count)]).toEqual([...plan.fromX]);
    writeGlideFrame(plan, to.layout, 1, frame);
    expect([...frame.x.subarray(0, plan.count)]).toEqual([...to.layout.x]);
    expect([...frame.y.subarray(0, plan.count)]).toEqual([...to.layout.y]);
  });

  it('moves each dot in a straight line, the given share of the way', () => {
    const frame = createGlideFrame(plan);
    writeGlideFrame(plan, to.layout, 0.25, frame);
    const slot = to.layout.nodeOf[JOHN_1_1] ?? -1;
    const x0 = plan.fromX[slot] ?? NaN;
    const x1 = to.layout.x[slot] ?? NaN;
    expect(frame.x[slot]).toBeCloseTo(x0 + (x1 - x0) * 0.25, 3);
  });

  it('keeps the leaving dots where they were, after the new ones', () => {
    const frame = createGlideFrame(plan);
    expect(frame.x).toHaveLength(plan.count + plan.leaving.length);
    writeGlideFrame(plan, to.layout, 0.6, frame);
    expect([...frame.x.subarray(plan.count)]).toEqual([...plan.leavingX]);
    expect([...frame.y.subarray(plan.count)]).toEqual([...plan.leavingY]);
  });

  it('stands in for the new layout mid-glide, so what is drawn over it follows the dots', () => {
    const frame = createGlideFrame(plan);
    writeGlideFrame(plan, to.layout, 0.5, frame);
    const shown = frameLayout(plan, to.layout, frame, 0.5);
    expect(shown.nodes).toBe(to.layout.nodes);
    expect(shown.groups).toBe(to.layout.groups);
    expect(shown.x).toHaveLength(plan.count);
    expect(shown.x[0]).toBe(frame.x[0]);
    expect(shown.dotRadius).toBe(glideDotRadius(plan, 0.5));
    expect(glideDotRadius(plan, 0)).toBe(from.layout.dotRadius);
    expect(glideDotRadius(plan, 1)).toBe(to.layout.dotRadius);
  });
});

describe('glideVertices', () => {
  /** One slot's numbers: start x, start y, end x, end y, genre, role. */
  function slotOf(vertices: Float32Array, slot: number): number[] {
    return [...vertices.subarray(slot * SLOT_FLOATS, (slot + 1) * SLOT_FLOATS)];
  }

  it('gives each dot of the new layout where it starts and ends, its genre and its role', () => {
    const from = sceneOf(null);
    const to = sceneOf('Gen');
    const plan = planGlide(from, to, index);
    const vertices = glideVertices(plan, to.layout, verseGenres);
    expect(vertices).toHaveLength((plan.count + plan.leaving.length) * SLOT_FLOATS);
    const slot = to.layout.nodeOf[JOHN_1_1] ?? -1;
    expect(slotOf(vertices, slot)).toEqual([
      plan.fromX[slot],
      plan.fromY[slot],
      to.layout.x[slot],
      to.layout.y[slot],
      verseGenres[JOHN_1_1],
      GLIDE_ROLE.kept,
    ]);
  });

  it('holds a leaving dot still where it was, and marks it as leaving', () => {
    const plan = planGlide(sceneOf(null), sceneOf('Gen'), index);
    const vertices = glideVertices(plan, sceneOf('Gen').layout, verseGenres);
    const x = plan.leavingX[1] ?? NaN;
    const y = plan.leavingY[1] ?? NaN;
    expect(slotOf(vertices, plan.count + 1)).toEqual([
      x,
      y,
      x,
      y,
      verseGenres[ISA_53_5],
      GLIDE_ROLE.leaving,
    ]);
  });

  it('marks the dots arriving, which start where they land', () => {
    const to = sceneOf(null);
    const plan = planGlide(sceneOf('Gen'), to, index);
    const vertices = glideVertices(plan, to.layout, verseGenres);
    const slot = to.layout.nodeOf[PS_23_1] ?? -1;
    const [x0, y0, x1, y1, , role] = slotOf(vertices, slot);
    expect([x0, y0]).toEqual([x1, y1]);
    expect(role).toBe(GLIDE_ROLE.arriving);
  });
});

describe('glideLinkIndices', () => {
  it('lists the links kept, then arriving, then leaving, as pairs of slots', () => {
    const from = sceneOf(null, createLinkFilter(-Infinity));
    const to = sceneOf('Gen');
    const plan = planGlide(from, to, index);
    const { indices, kept, arriving, leaving } = glideLinkIndices(plan);
    expect(kept).toBe(plan.links.kept.from.length * 2);
    expect(arriving).toBe(0);
    expect(leaving).toBe(plan.links.leaving.from.length * 2);
    expect(indices).toHaveLength(kept + arriving + leaving);
    expect([indices[0], indices[1]]).toEqual([plan.links.kept.from[0], plan.links.kept.to[0]]);
    expect([indices[kept], indices[kept + 1]]).toEqual([
      plan.links.leaving.from[0],
      plan.links.leaving.to[0],
    ]);
  });

  it('is empty when nothing is linked', () => {
    const empty: ShownScene = { ...sceneOf(null), linkIds: new Int32Array(0) };
    const result = glideLinkIndices(planGlide(empty, empty, index));
    expect(result.indices).toHaveLength(0);
  });
});
