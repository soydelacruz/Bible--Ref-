import type { VerseIndexRange } from '../../core/bible/versification.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { simulate } from '../shared/frames.ts';
import { allocateArcInstances, fillArcInstances, type ArcInstances } from './arc-instances.ts';

/** The links lit up by books brushed on the minimap, and their arcs. */
export interface LitLinks {
  /** The books, as the verses they span. */
  readonly range: VerseIndexRange;
  /** The links' ids, in the order of the links searched, so they draw as the background does. */
  readonly ids: Int32Array;
  readonly instances: ArcInstances;
}

/** How many links a search goes through between looks at the clock. */
const LINKS_PER_LOOK = 4096;

/**
 * A search for the links among `linkIds` that start or end in `range`, from a verse in it or to a
 * passage that overlaps it, that also builds their arcs. Books brushed over most of the Bible light
 * a quarter of a million links, more than a frame has time to find and build, so the search goes a
 * slice at a time: each `step` works until its deadline and picks up where the last one stopped.
 * It goes through the links once, and through the lit ones once more to build their arcs.
 */
export class LitLinksSearch {
  readonly #index: CrossReferenceIndex;
  readonly #linkIds: Int32Array;
  readonly #range: VerseIndexRange;
  readonly #verseGenres: Uint8Array;
  readonly #linksPerLook: number;
  /** While finding: the ids found so far, in a buffer as long as all the links. */
  readonly #found: Int32Array;
  #count = 0;
  /** How far through the links (while finding) or the lit ones (while building) it has got. */
  #cursor = 0;
  /** Once all are found: the lit links, with their arcs filled in up to the cursor. */
  #lit: LitLinks | null = null;
  #done = false;

  constructor(
    index: CrossReferenceIndex,
    linkIds: Int32Array,
    range: VerseIndexRange,
    verseGenres: Uint8Array,
    linksPerLook = LINKS_PER_LOOK,
  ) {
    this.#index = index;
    this.#linkIds = linkIds;
    this.#range = range;
    this.#verseGenres = verseGenres;
    this.#linksPerLook = linksPerLook;
    this.#found = new Int32Array(linkIds.length);
  }

  /**
   * Searches on until `deadline` (a `performance.now()` time) has passed, at least one slice
   * whatever the clock says. Returns the lit links once the search is through, `null` until then.
   */
  step(deadline: number): LitLinks | null {
    while (!this.#done) {
      if (this.#lit) {
        this.#build(this.#lit);
      } else {
        this.#find();
      }
      if (performance.now() >= deadline) {
        break;
      }
    }
    return this.#done ? this.#lit : null;
  }

  #find(): void {
    const { sources, targetStarts, targetEnds } = this.#index;
    const { start, end } = this.#range;
    const linkIds = this.#linkIds;
    const found = this.#found;
    const stop = Math.min(this.#cursor + this.#linksPerLook, linkIds.length);
    let count = this.#count;
    // Read straight from the columns, not through `elementAt`: this runs for every link shown.
    for (let i = this.#cursor; i < stop; i += 1) {
      const id = linkIds[i] ?? 0;
      const source = sources[id] ?? 0;
      if (
        (source >= start && source <= end) ||
        ((targetStarts[id] ?? 0) <= end && (targetEnds[id] ?? 0) >= start)
      ) {
        found[count] = id;
        count += 1;
      }
    }
    this.#count = count;
    this.#cursor = stop;
    if (stop === linkIds.length) {
      this.#lit = {
        range: this.#range,
        ids: found.slice(0, count),
        instances: allocateArcInstances(count),
      };
      this.#cursor = 0;
      this.#done = count === 0;
    }
  }

  #build(lit: LitLinks): void {
    const stop = Math.min(this.#cursor + this.#linksPerLook, lit.ids.length);
    fillArcInstances(lit.instances, this.#index, lit.ids, this.#verseGenres, this.#cursor, stop);
    this.#cursor = stop;
    this.#done = stop === lit.ids.length;
  }
}

/** The longest a slice of a search takes, in ms: what a frame at 120 Hz can spare for it. */
export const SLICE_MS = 4;

/**
 * Runs `search` a slice per frame, the first one at once, so that a few books are lit up in the
 * frame they were asked for, and hands `onFound` the lit links when it is through. Returns a
 * cancel function.
 */
export function runLitLinksSearch(
  search: LitLinksSearch,
  onFound: (lit: LitLinks) => void,
): () => void {
  const slice = () => {
    const lit = search.step(performance.now() + SLICE_MS);
    if (lit) {
      onFound(lit);
    }
    return lit === null;
  };
  if (!slice()) {
    return () => undefined;
  }
  return simulate(slice);
}
