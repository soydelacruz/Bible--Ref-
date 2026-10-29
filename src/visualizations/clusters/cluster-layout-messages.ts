import { BOOKS, type BookId } from '../../core/bible/books.ts';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import {
  expectArrayOf,
  expectInteger,
  expectOneOf,
  expectRecord,
  ValidationError,
  type UnknownRecord,
} from '../../core/lib/validation.ts';
import type { WorkerResult } from '../../core/lib/worker-rpc.ts';
import {
  computeClusterLayout,
  type Band,
  type ClusterGroup,
  type ClusterLayout,
  type ClusterSide,
} from './cluster-layout.ts';

/**
 * What passes between the page and the Clusters layout worker (`cluster-layout.worker.ts`): the
 * verses that get a dot and the stage's size one way, the layout the other. Both directions are
 * checked on arrival, since a message is only as typed as the code that reads it.
 */

const BOOK_IDS: readonly BookId[] = BOOKS.map(({ id }) => id);
const SIDES: readonly ClusterSide[] = ['start', 'center', 'end'];

export interface LayoutRequest {
  readonly nodes: Int32Array;
  readonly openBook: BookId | null;
  readonly width: number;
  readonly height: number;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(path, 'expected a number');
  }
  return value;
}

function expectArrayOfType<T>(
  record: UnknownRecord,
  key: string,
  type: { new (length: number): T; prototype: T },
): T {
  const value = record[key];
  if (!(value instanceof type)) {
    throw new ValidationError(key, 'expected a typed array');
  }
  return value;
}

function parseRequest(message: unknown): LayoutRequest {
  const record = expectRecord(message, 'request');
  const openBook = record['openBook'];
  return {
    nodes: expectArrayOfType(record, 'nodes', Int32Array),
    openBook: openBook === null ? null : expectOneOf(openBook, BOOK_IDS, 'openBook'),
    width: expectNumber(record['width'], 'width'),
    height: expectNumber(record['height'], 'height'),
  };
}

/** The worker's side: lays the dots out, and hands their arrays back without copying them. */
export function answerLayoutRequest(message: unknown): WorkerResult {
  const { nodes, openBook, width, height } = parseRequest(message);
  const layout = computeClusterLayout({ nodes }, CANONICAL_VERSIFICATION, openBook, {
    width,
    height,
  });
  return {
    value: layout,
    transfer: [layout.nodes, layout.x, layout.y, layout.nodeGroup, layout.nodeOf].flatMap(
      ({ buffer }) => (buffer instanceof ArrayBuffer ? [buffer] : []),
    ),
  };
}

function parseBand(value: unknown, path: string): Band {
  const band = expectRecord(value, path);
  return {
    x0: expectNumber(band['x0'], `${path}.x0`),
    x1: expectNumber(band['x1'], `${path}.x1`),
    y0: expectNumber(band['y0'], `${path}.y0`),
    y1: expectNumber(band['y1'], `${path}.y1`),
  };
}

function parseGroup(value: unknown, path: string): ClusterGroup {
  const group = expectRecord(value, path);
  const chapter = group['chapter'];
  return {
    book: expectOneOf(group['book'], BOOK_IDS, `${path}.book`),
    chapter: chapter === null ? null : expectInteger(chapter, `${path}.chapter`),
    side: expectOneOf(group['side'], SIDES, `${path}.side`),
    first: expectInteger(group['first'], `${path}.first`),
    count: expectInteger(group['count'], `${path}.count`),
    x: expectNumber(group['x'], `${path}.x`),
    y: expectNumber(group['y'], `${path}.y`),
    r: expectNumber(group['r'], `${path}.r`),
  };
}

/**
 * Reads the worker's layout. `nodes` are the graph's own, which the layout keeps rather than the
 * copy the worker was sent, so the graph and its layout share them as they would have before.
 */
export function acceptClusterLayout(value: unknown, nodes: Int32Array): ClusterLayout {
  const layout = expectRecord(value, 'layout');
  const bands = expectRecord(layout['bands'], 'bands');
  const usedBands: Partial<Record<ClusterSide, Band>> = {};
  for (const side of SIDES) {
    if (bands[side] !== undefined) {
      usedBands[side] = parseBand(bands[side], `bands.${side}`);
    }
  }
  return {
    width: expectNumber(layout['width'], 'width'),
    height: expectNumber(layout['height'], 'height'),
    orientation: expectOneOf(layout['orientation'], ['landscape', 'portrait'], 'orientation'),
    bands: usedBands,
    groups: expectArrayOf(layout['groups'], 'groups', parseGroup),
    nodes,
    x: expectArrayOfType(layout, 'x', Float32Array),
    y: expectArrayOfType(layout, 'y', Float32Array),
    nodeGroup: expectArrayOfType(layout, 'nodeGroup', Uint16Array),
    nodeOf: expectArrayOfType(layout, 'nodeOf', Int32Array),
    spacing: expectNumber(layout['spacing'], 'spacing'),
    dotRadius: expectNumber(layout['dotRadius'], 'dotRadius'),
  };
}
