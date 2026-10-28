import type { PlacedLabel } from './cluster-glide.ts';
import type { ClusterGroup, ClusterLayout, ClusterSide } from './cluster-layout.ts';

/** A rectangle on the stage, in CSS pixels. */
export interface LabelBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * A label where the layout put it: its text is drawn centred on `x`, standing on `y` (a heading
 * on its alphabetic baseline). `box` is the room it keeps clear of every other label, and `group`
 * the cluster it names, by index in the layout (`null` for a band's heading).
 */
export interface ClusterLabel extends PlacedLabel {
  readonly box: LabelBox;
  readonly group: number | null;
}

/** A cluster's name in full, and short for where the full name has no room. */
export interface LabelText {
  readonly full: string;
  readonly short: string;
}

export interface LabelSetting {
  /** How wide `text` is drawn as a label of `kind`, in CSS pixels. */
  readonly measure: (text: string, kind: PlacedLabel['kind']) => number;
  readonly name: (group: ClusterGroup) => LabelText;
  /** The heading over each band, e.g. "OLD TESTAMENT". */
  readonly headings: Readonly<Partial<Record<ClusterSide, string>>>;
}

/** The type size of each kind of label, which is also how tall it stands. */
export const LABEL_SIZE = { name: 11, chapter: 10, heading: 11 } as const satisfies Record<
  PlacedLabel['kind'],
  number
>;

/** Between a cluster's edge and its name. */
const GAP = 3;
/** Kept clear around every label's text, so two never touch. */
const PAD_X = 2;
const PAD_Y = 1;
/** A name may cross the rim of another cluster, but not reach this far into it. */
const CORE_SHARE = 0.7;

/** Where a name may go around its cluster, best first: above it, then below, right and left. */
const SPOTS = ['above', 'below', 'right', 'left'] as const;
type Spot = (typeof SPOTS)[number];

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Whether a box reaches into the core of a disc (`CORE_SHARE` of its radius). */
function reachesCore(box: LabelBox, group: ClusterGroup): boolean {
  const dx = Math.max(box.x0 - group.x, 0, group.x - box.x1);
  const dy = Math.max(box.y0 - group.y, 0, group.y - box.y1);
  return Math.hypot(dx, dy) < group.r * CORE_SHARE;
}

/** The text's own box at a spot around its cluster (not yet padded). */
function textBox(group: ClusterGroup, spot: Spot, width: number, height: number): LabelBox {
  const { x, y, r } = group;
  switch (spot) {
    case 'above':
      return { x0: x - width / 2, x1: x + width / 2, y0: y - r - GAP - height, y1: y - r - GAP };
    case 'below':
      return { x0: x - width / 2, x1: x + width / 2, y0: y + r + GAP, y1: y + r + GAP + height };
    case 'right':
      return { x0: x + r + GAP, x1: x + r + GAP + width, y0: y - height / 2, y1: y + height / 2 };
    case 'left':
      return { x0: x - r - GAP - width, x1: x - r - GAP, y0: y - height / 2, y1: y + height / 2 };
  }
}

function padded(box: LabelBox): LabelBox {
  return { x0: box.x0 - PAD_X, x1: box.x1 + PAD_X, y0: box.y0 - PAD_Y, y1: box.y1 + PAD_Y };
}

/** The names a cluster may go by, in the order to try them: full first where it has room. */
function textsOf(group: ClusterGroup, text: LabelText, measure: LabelSetting['measure']) {
  const kind = group.chapter === null ? 'name' : 'chapter';
  const room = Math.max(2 * group.r + 24, 48);
  const texts =
    measure(text.full, kind) <= room || text.short === text.full
      ? [text.full, text.short]
      : [text.short];
  return { kind, texts: [...new Set(texts)] } as const;
}

/**
 * Where the names of the clusters and the headings of the bands go, so that no two overlap and
 * none runs off the stage. The headings are placed first; then the clusters, biggest first, each
 * named where it first fits: above itself, then below, right or left, clear of the other
 * clusters' middles if it can be and across their dots if it must; in full, then short, and left
 * out if neither fits (pointing at the cluster still names it).
 *
 * Worked out once per picture, from the picture alone, so the same picture always has the same
 * names in the same places, and a glide moves them rather than deals them again.
 */
export function placeClusterLabels(layout: ClusterLayout, setting: LabelSetting): ClusterLabel[] {
  const { measure } = setting;
  const labels: ClusterLabel[] = [];
  const stage: LabelBox = { x0: 0, x1: layout.width, y0: 0, y1: layout.height };
  const fits = (box: LabelBox) =>
    box.x0 >= stage.x0 &&
    box.x1 <= stage.x1 &&
    box.y0 >= stage.y0 &&
    box.y1 <= stage.y1 &&
    !labels.some((label) => overlaps(label.box, box));

  for (const side of ['start', 'center', 'end'] as const) {
    const band = layout.bands[side];
    const heading = setting.headings[side];
    if (!band || !heading) continue;
    const text = heading.toUpperCase();
    const width = measure(text, 'heading');
    const x = (band.x0 + band.x1) / 2;
    const y = Math.max(14, band.y0 - 4);
    // Set on its alphabetic baseline: most of the type above it, the descenders below.
    const height = LABEL_SIZE.heading;
    const box = padded({ x0: x - width / 2, x1: x + width / 2, y0: y - height * 0.8, y1: y + 3 });
    labels.push({ key: side, text, kind: 'heading', x, y, box, group: null });
  }

  const order = layout.groups.map((group, index) => ({ group, index }));
  // Biggest first; a stable sort keeps clusters of one size in canonical order.
  order.sort((a, b) => b.group.r - a.group.r);
  for (const { group, index } of order) {
    const { kind, texts } = textsOf(group, setting.name(group), measure);
    const height = LABEL_SIZE[kind];
    const clearOfCores = (box: LabelBox) =>
      layout.groups.every((other, i) => i === index || !reachesCore(box, other));
    let placed: ClusterLabel | null = null;
    search: for (const text of texts) {
      const width = measure(text, kind);
      for (const strict of [true, false]) {
        for (const spot of SPOTS) {
          const own = textBox(group, spot, width, height);
          const box = padded(own);
          if (!fits(box) || (strict && !clearOfCores(box))) continue;
          const key = `${group.book}.${String(group.chapter ?? '')}`;
          placed = { key, text, kind, x: (own.x0 + own.x1) / 2, y: own.y1, box, group: index };
          break search;
        }
      }
    }
    if (placed) labels.push(placed);
  }
  return labels;
}

/** The cluster whose name is under a point, by index in the layout, or `null`. */
export function labelAt(labels: readonly ClusterLabel[], x: number, y: number): number | null {
  for (const label of labels) {
    const { box } = label;
    if (label.group !== null && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) {
      return label.group;
    }
  }
  return null;
}
