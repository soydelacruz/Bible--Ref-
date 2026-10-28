import { describe, expect, it } from 'vitest';
import type { ClusterLayout } from './cluster-layout.ts';
import { passageCenter } from './passage-center.ts';

/** Ten verses; 2, 3 and 7 have dots. */
const LAYOUT = {
  nodes: Int32Array.of(2, 3, 7),
  x: Float32Array.of(10, 30, 100),
  y: Float32Array.of(40, 60, 5),
  nodeOf: Int32Array.of(-1, -1, 0, 1, -1, -1, -1, 2, -1, -1),
} as unknown as ClusterLayout;

describe('passageCenter', () => {
  it("is a verse's dot", () => {
    expect(passageCenter(LAYOUT, { start: 7, end: 7 })).toEqual({ x: 100, y: 5 });
  });

  it("is the middle of a chapter's dots, leaving out its verses without one", () => {
    expect(passageCenter(LAYOUT, { start: 0, end: 4 })).toEqual({ x: 20, y: 50 });
  });

  it('is nowhere for a passage with no dot', () => {
    expect(passageCenter(LAYOUT, { start: 4, end: 6 })).toBeNull();
  });
});
