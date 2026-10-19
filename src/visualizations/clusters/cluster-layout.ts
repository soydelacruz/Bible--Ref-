import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { BookId } from '../../core/bible/books.ts';
import type { VerseIndex } from '../../core/bible/verse-ref.ts';
import type { Versification } from '../../core/bible/versification.ts';
import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { compileLinkFilter, type LinkFilter } from '../shared/link-filter.ts';

/**
 * The links drawn, and the verses they join. A link is drawn from its source verse to the first
 * verse of its target range, so those are the only verses that need a dot.
 */
export interface ClusterGraph {
  /** IDs of the links drawn, in dataset order. */
  readonly linkIds: Int32Array;
  /** Verses with a dot, in canonical order. */
  readonly nodes: Int32Array;
}

/**
 * The links that pass the filter, and their verses. With a book opened, only the links that touch
 * it: the rest of the Bible is then shown as the places that book connects to.
 */
export function selectClusterGraph(
  index: CrossReferenceIndex,
  verseGenres: Uint8Array,
  filter: LinkFilter,
  versification: Versification,
  openBook: BookId | null,
): ClusterGraph {
  const passes = compileLinkFilter(filter, verseGenres);
  const range = openBook ? versification.bookRange(openBook) : null;
  const inBook = (verse: VerseIndex) => !range || (verse >= range.start && verse <= range.end);
  const linked = new Uint8Array(index.verseCount);
  const ids = new Int32Array(index.linkCount);
  let count = 0;
  for (let id = 0; id < index.linkCount; id += 1) {
    const from = elementAt(index.sources, id);
    const to = elementAt(index.targetStarts, id);
    if ((inBook(from) || inBook(to)) && passes(from, to, elementAt(index.votes, id))) {
      ids[count] = id;
      count += 1;
      linked[from] = 1;
      linked[to] = 1;
    }
  }
  const nodes: number[] = [];
  linked.forEach((flag, verse) => {
    if (flag) nodes.push(verse);
  });
  return { linkIds: ids.slice(0, count), nodes: Int32Array.from(nodes) };
}

/** Which part of the stage a cluster belongs to: the Old Testament, an opened book, the New. */
export type ClusterSide = 'start' | 'center' | 'end';

export interface ClusterGroup {
  readonly book: BookId;
  /** The chapter, for the clusters of an opened book; `null` for a whole book. */
  readonly chapter: number | null;
  readonly side: ClusterSide;
  /** Position of the group's first verse in `ClusterLayout.nodes`; its verses are contiguous. */
  readonly first: number;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface Band {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface ClusterLayout {
  readonly width: number;
  readonly height: number;
  /** Testaments side by side, or one above the other on a tall screen. */
  readonly orientation: 'landscape' | 'portrait';
  /** The bands that hold at least one cluster. */
  readonly bands: Readonly<Partial<Record<ClusterSide, Band>>>;
  readonly groups: readonly ClusterGroup[];
  /** The verses with a dot, in canonical order (the graph's `nodes`). */
  readonly nodes: Int32Array;
  /** Dot centers, by position in `nodes`. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** The group of each dot, by position in `nodes`. */
  readonly nodeGroup: Uint16Array;
  /** Position in `nodes` of every verse, or −1 for a verse with no dot. */
  readonly nodeOf: Int32Array;
  /** Distance between neighboring dots, and the radius of one. */
  readonly spacing: number;
  readonly dotRadius: number;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Room left around the clusters: headings above, the edges of the stage elsewhere. */
export const DEFAULT_INSETS: Insets = { top: 48, right: 24, bottom: 32, left: 24 };

const SIDES = ['start', 'center', 'end'] as const satisfies readonly ClusterSide[];
/** The golden angle: successive dots of a spiral at this angle spread evenly over a disc. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** On a sunflower spiral each dot covers π·c², so its neighbors are √π·c apart. */
const SPIRAL_DENSITY = Math.sqrt(Math.PI);
/** Share of a band the clusters may fill; the rest is the room between them. */
const FILL = 0.5;
const MIN_SPACING = 1.5;
const MAX_SPACING = 14;
const SIMULATION_TICKS = 300;
/** Room above a cluster for its name, so the top row's names stay clear of the band's heading. */
export const LABEL_ROOM = 16;

/** Radius of a cluster of `count` dots, as a multiple of the spacing between dots. */
function radiusFactor(count: number): number {
  return Math.sqrt(count) / SPIRAL_DENSITY + 0.5;
}

interface PendingGroup {
  readonly book: BookId;
  readonly chapter: number | null;
  readonly side: ClusterSide;
  readonly first: number;
  count: number;
}

function groupNodes(
  nodes: Int32Array,
  versification: Versification,
  openBook: BookId | null,
): PendingGroup[] {
  const groups: PendingGroup[] = [];
  nodes.forEach((verse, position) => {
    const book = versification.bookAt(verse);
    const opened = book.id === openBook;
    const chapter = opened ? versification.refAt(verse).chapter : null;
    const last = groups.at(-1);
    if (last?.book === book.id && last.chapter === chapter) {
      last.count += 1;
      return;
    }
    const side: ClusterSide = opened ? 'center' : book.testament === 'OT' ? 'start' : 'end';
    groups.push({ book: book.id, chapter, side, first: position, count: 1 });
  });
  return groups;
}

/** Where each side's clusters go: two halves, or three columns when a book is opened. */
export function computeBands(
  width: number,
  height: number,
  open: boolean,
  insets: Insets = DEFAULT_INSETS,
): { orientation: ClusterLayout['orientation']; bands: Record<ClusterSide, Band> } {
  const orientation = height > width ? 'portrait' : 'landscape';
  const landscape = orientation === 'landscape';
  const along = landscape ? width : height;
  const lead = landscape ? insets.left : insets.top;
  const trail = along - (landscape ? insets.right : insets.bottom);
  const [a, b, c, d, e, f] = open
    ? [lead, along * 0.27, along * 0.31, along * 0.69, along * 0.73, trail]
    : [lead, along * 0.46, along * 0.5, along * 0.5, along * 0.54, trail];
  const span = (from: number, to: number): Band =>
    landscape
      ? { x0: from, x1: to, y0: insets.top, y1: height - insets.bottom }
      : { x0: insets.left, x1: width - insets.right, y0: from, y1: to };
  return { orientation, bands: { start: span(a, b), center: span(c, d), end: span(e, f) } };
}

/**
 * The largest spacing between dots at which every side's clusters fit their band: they may fill
 * half its area, and the biggest of them must fit across it.
 */
export function fitSpacing(
  groups: readonly { readonly side: ClusterSide; readonly count: number }[],
  bands: Readonly<Record<ClusterSide, Band>>,
): number {
  let spacing = MAX_SPACING;
  for (const side of SIDES) {
    const members = groups.filter((group) => group.side === side);
    if (members.length === 0) continue;
    const band = bands[side];
    const bandWidth = band.x1 - band.x0;
    const bandHeight = band.y1 - band.y0;
    const area = members.reduce((sum, group) => sum + Math.PI * radiusFactor(group.count) ** 2, 0);
    const largest = Math.max(...members.map((group) => radiusFactor(group.count)));
    spacing = Math.min(
      spacing,
      Math.sqrt((FILL * bandWidth * bandHeight) / area),
      Math.min(bandWidth, bandHeight) / (2 * largest),
    );
  }
  return Math.max(MIN_SPACING, spacing);
}

interface SimNode extends SimulationNodeDatum {
  readonly r: number;
  x: number;
  y: number;
}

/**
 * Packs one band's clusters: they start on a grid in canonical order, so neighbors in the Bible
 * stay neighbors on the screen, then gather toward the band's center without overlapping.
 */
function packBand(radii: readonly number[], band: Band, gap: number): SimNode[] {
  const width = band.x1 - band.x0;
  const height = band.y1 - band.y0;
  const columns = Math.max(1, Math.round(Math.sqrt((radii.length * width) / height)));
  const rows = Math.ceil(radii.length / columns);
  const nodes: SimNode[] = radii.map((r, index) => ({
    r,
    x: band.x0 + ((index % columns) + 0.5) * (width / columns),
    y: band.y0 + (Math.floor(index / columns) + 0.5) * (height / rows),
  }));
  const simulation = forceSimulation(nodes)
    .force('x', forceX<SimNode>((band.x0 + band.x1) / 2).strength(0.05))
    .force('y', forceY<SimNode>((band.y0 + band.y1) / 2).strength(0.05))
    .force(
      'collide',
      forceCollide<SimNode>((node) => node.r + gap / 2)
        .strength(1)
        .iterations(3),
    )
    .stop();
  for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
    simulation.tick();
    for (const node of nodes) {
      node.x = Math.min(band.x1 - node.r, Math.max(band.x0 + node.r, node.x));
      node.y = Math.min(band.y1 - node.r, Math.max(band.y0 + node.r + LABEL_ROOM, node.y));
    }
  }
  return nodes;
}

/**
 * Lays the dots out: one cluster per book (or per chapter of an opened book), each a sunflower
 * spiral of its verses in canonical order, so a book reads from its center outward. Deterministic:
 * the same graph and size always give the same picture.
 */
export function computeClusterLayout(
  graph: ClusterGraph,
  versification: Versification,
  openBook: BookId | null,
  size: { readonly width: number; readonly height: number },
  insets: Insets = DEFAULT_INSETS,
): ClusterLayout {
  const { width, height } = size;
  const { nodes } = graph;
  const pending = groupNodes(nodes, versification, openBook);
  const { orientation, bands } = computeBands(width, height, openBook !== null, insets);
  const spacing = fitSpacing(pending, bands);
  const gap = Math.max(10, spacing * 2);

  const centers = new Map<PendingGroup, { x: number; y: number }>();
  for (const side of SIDES) {
    const members = pending.filter((group) => group.side === side);
    const radii = members.map((group) => spacing * radiusFactor(group.count));
    packBand(radii, bands[side], gap).forEach(({ x, y }, index) => {
      centers.set(elementAt(members, index), { x, y });
    });
  }

  const x = new Float32Array(nodes.length);
  const y = new Float32Array(nodes.length);
  const nodeGroup = new Uint16Array(nodes.length);
  const step = spacing / SPIRAL_DENSITY;
  const groups = pending.map((group, groupIndex): ClusterGroup => {
    const center = centers.get(group) ?? { x: width / 2, y: height / 2 };
    for (let offset = 0; offset < group.count; offset += 1) {
      const position = group.first + offset;
      const distance = step * Math.sqrt(offset + 0.5);
      const angle = offset * GOLDEN_ANGLE;
      x[position] = center.x + distance * Math.cos(angle);
      y[position] = center.y + distance * Math.sin(angle);
      nodeGroup[position] = groupIndex;
    }
    return { ...group, ...center, r: spacing * radiusFactor(group.count) };
  });

  const nodeOf = new Int32Array(versification.verseCount).fill(-1);
  nodes.forEach((verse, position) => {
    nodeOf[verse] = position;
  });

  const usedBands: Partial<Record<ClusterSide, Band>> = {};
  for (const side of SIDES) {
    if (pending.some((group) => group.side === side)) usedBands[side] = bands[side];
  }

  return {
    width,
    height,
    orientation,
    bands: usedBands,
    groups,
    nodes,
    x,
    y,
    nodeGroup,
    nodeOf,
    spacing,
    dotRadius: Math.max(0.8, spacing * 0.36),
  };
}

/** What a pointer is over: one verse, or a whole cluster. */
export type ClusterTarget =
  | { readonly kind: 'verse'; readonly verse: VerseIndex; readonly group: number }
  | { readonly kind: 'group'; readonly group: number };

/**
 * The band around a cluster that points at the whole book. Inside a cluster the dots are a few
 * pixels apart, so almost any point there is near some verse; the book needs ground of its own,
 * wide enough to aim at: this rim, and the cluster's name above it.
 */
export function rimWidth(layout: ClusterLayout): number {
  return Math.max(8, layout.spacing * 3);
}

/** Half the width of a cluster's name, for pointing at it (names are drawn about this wide). */
const LABEL_HALF_WIDTH = 24;

function onLabel(group: ClusterGroup, px: number, py: number): boolean {
  const bottom = group.y - group.r;
  return (
    py <= bottom &&
    py >= bottom - LABEL_ROOM &&
    Math.abs(px - group.x) <= Math.max(group.r, LABEL_HALF_WIDTH)
  );
}

/**
 * What is under a point: a verse inside a cluster's disc, the whole cluster on its rim or its
 * name, or nothing.
 */
export function targetAt(layout: ClusterLayout, px: number, py: number): ClusterTarget | null {
  const inside = layout.groups.findIndex(
    (group) => Math.hypot(px - group.x, py - group.y) <= group.r,
  );
  const group = layout.groups[inside];
  if (group) {
    const verse = nearestVerse(layout, group, px, py);
    return verse === null
      ? { kind: 'group', group: inside }
      : { kind: 'verse', verse, group: inside };
  }
  const rim = rimWidth(layout);
  let best = -1;
  let bestGap = Infinity;
  layout.groups.forEach((candidate, index) => {
    const gap = onLabel(candidate, px, py)
      ? 0
      : Math.hypot(px - candidate.x, py - candidate.y) - candidate.r;
    if (gap <= rim && gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best < 0 ? null : { kind: 'group', group: best };
}

/** The verse of a cluster whose dot is nearest a point, within one spacing, or `null`. */
function nearestVerse(
  layout: ClusterLayout,
  group: ClusterGroup,
  px: number,
  py: number,
): VerseIndex | null {
  let best: VerseIndex | null = null;
  let bestDistance = Math.max(layout.spacing, layout.dotRadius * 2);
  for (let position = group.first; position < group.first + group.count; position += 1) {
    const distance = Math.hypot(
      px - elementAt(layout.x, position),
      py - elementAt(layout.y, position),
    );
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = elementAt(layout.nodes, position);
    }
  }
  return best;
}
