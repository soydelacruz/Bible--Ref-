import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Passage } from '../core/bible/passage.ts';
import { verseIndex } from '../test-utils/fixtures.ts';
import { createVizData } from '../test-utils/viz-data.ts';
import { createLinkFilter, type LinkFilter } from '../visualizations/shared/link-filter.ts';
import { useWander } from './use-wander.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);
const EXOD = verseIndex('Exod', 1, 1);

/** Twelve links, each between verses of its own: 24 verses with one link each, all in the pool. */
const core = createVizData(
  Array.from({ length: 12 }, (_, i) => ({ from: GEN_1_1 + i, to: EXOD + i, votes: 4 })),
);

function render(filter: LinkFilter = createLinkFilter(0), passage: Passage | null = null) {
  return renderHook(
    (props: { filter: LinkFilter; passage: Passage | null }) =>
      useWander(core, props.filter, props.passage),
    { initialProps: { filter, passage } },
  );
}

describe('useWander', () => {
  it('goes somewhere other than the passage on screen', () => {
    const { result } = render(createLinkFilter(0), { kind: 'verse', verse: GEN_1_1 });
    for (let i = 0; i < 30; i += 1) {
      expect(result.current()).not.toBe(GEN_1_1);
    }
  });

  it('goes somewhere outside the chapter on screen', () => {
    const { result } = render(createLinkFilter(0), { kind: 'chapter', book: 'Gen', chapter: 1 });
    for (let i = 0; i < 30; i += 1) {
      expect(result.current()).toBeGreaterThanOrEqual(EXOD);
    }
  });

  it('does not come back to where it went lately', () => {
    const { result } = render();
    const picks = Array.from({ length: 10 }, () => result.current());
    expect(new Set(picks).size).toBe(10);
  });

  it('chooses again under a new filter, and has nowhere to go when it hides every link', () => {
    const { result, rerender } = render();
    expect(result.current()).not.toBeNull();
    // The same filter in another object keeps the pool it has.
    rerender({ filter: createLinkFilter(0), passage: null });
    expect(result.current()).not.toBeNull();
    rerender({ filter: createLinkFilter(5), passage: null });
    expect(result.current()).toBeNull();
  });
});
