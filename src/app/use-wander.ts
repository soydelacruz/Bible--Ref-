import { useRef } from 'react';
import { passageRange, type Passage } from '../core/bible/passage.ts';
import type { VerseIndex } from '../core/bible/verse-ref.ts';
import type { LinkFilter } from '../visualizations/shared/link-filter.ts';
import type { VizCore } from '../visualizations/shared/viz-data.ts';
import { pickWanderVerse, rememberPick, wanderPool, type WanderPool } from './wander.ts';

/** A filter as a key: equal filters give equal keys, whichever object holds them. */
function filterKey(filter: LinkFilter): string {
  return `${String(filter.minVotes)}|${[...filter.hiddenGenres].sort().join(',')}`;
}

/**
 * Wander, for the host: a function that picks the verse to go to next, away from the passage on
 * screen and under the filter in use, or `null` when no verse has links under it.
 *
 * The pool is worked out at the first press under a filter rather than whenever the filter
 * changes: it is a pass over every link, which a reader who never presses Wander should not pay
 * for, on a phone, at every change of the filters. The recent picks last as long as the page.
 */
export function useWander(
  core: VizCore,
  filter: LinkFilter,
  passage: Passage | null,
): () => VerseIndex | null {
  const cache = useRef<{ readonly key: string; readonly pool: WanderPool } | null>(null);
  const recent = useRef<readonly VerseIndex[]>([]);
  return () => {
    const key = filterKey(filter);
    const pool =
      cache.current?.key === key
        ? cache.current.pool
        : wanderPool(core.crossReferences.index, core.verseGenres, filter);
    cache.current = { key, pool };
    const here = passage && passageRange(passage, core.versification);
    const verse = pickWanderVerse(
      pool,
      (candidate) => here !== null && candidate >= here.start && candidate <= here.end,
      recent.current,
      Math.random,
    );
    if (verse !== null) {
      recent.current = rememberPick(recent.current, verse);
    }
    return verse;
  };
}
