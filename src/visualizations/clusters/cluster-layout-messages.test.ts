import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { verseIndex } from '../../test-utils/fixtures.ts';
import { acceptClusterLayout, answerLayoutRequest } from './cluster-layout-messages.ts';
import { computeClusterLayout } from './cluster-layout.ts';

const nodes = Int32Array.from([
  verseIndex('Gen', 1, 1),
  verseIndex('Gen', 3, 15),
  verseIndex('Ps', 23, 1),
  verseIndex('John', 1, 1),
  verseIndex('John', 3, 16),
]);
const SIZE = { width: 1200, height: 800 };

describe('a layout from the worker', () => {
  it('is the layout worked out here, with the graph’s own verses', () => {
    for (const openBook of [null, 'Gen'] as const) {
      const { value, transfer } = answerLayoutRequest({ nodes: nodes.slice(), openBook, ...SIZE });
      // Its arrays are handed back, not copied: the verses sent, the dots, their groups, the index.
      expect(transfer).toHaveLength(5);
      const layout = acceptClusterLayout(value, nodes);
      expect(layout).toEqual(
        computeClusterLayout({ nodes }, CANONICAL_VERSIFICATION, openBook, SIZE),
      );
      expect(layout.nodes).toBe(nodes);
    }
  });

  it('keeps only the bands that hold clusters', () => {
    const { value } = answerLayoutRequest({
      nodes: Int32Array.from([verseIndex('John', 3, 16)]),
      openBook: null,
      ...SIZE,
    });
    expect(Object.keys(acceptClusterLayout(value, nodes).bands)).toEqual(['end']);
  });

  it('is refused if it is not a layout', () => {
    const { value } = answerLayoutRequest({ nodes: nodes.slice(), openBook: null, ...SIZE });
    const layout = acceptClusterLayout(value, nodes);
    expect(() => acceptClusterLayout({ ...layout, x: [1, 2] }, nodes)).toThrow(
      'x: expected a typed array',
    );
    expect(() => acceptClusterLayout({ ...layout, spacing: Number.NaN }, nodes)).toThrow(
      'spacing: expected a number',
    );
    expect(() =>
      acceptClusterLayout({ ...layout, groups: [{ ...layout.groups[0], side: 'middle' }] }, nodes),
    ).toThrow('groups[0].side');
  });
});

describe('a request to the worker', () => {
  it('is refused if it is not one', () => {
    expect(() => answerLayoutRequest({ nodes: [1, 2], openBook: null, ...SIZE })).toThrow(
      'nodes: expected a typed array',
    );
    expect(() => answerLayoutRequest({ nodes, openBook: 'Narnia', ...SIZE })).toThrow('openBook');
    expect(() =>
      answerLayoutRequest({ nodes, openBook: null, width: '1200', height: 800 }),
    ).toThrow('width: expected a number');
  });
});
