import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { voteWeight } from '../shared/vote-weight.ts';

/** Per-arc GPU attributes, one entry per link. */
export interface ArcInstances {
  readonly count: number;
  /** Source and target positions on the axis, in continuous verse units (centers). */
  readonly endpoints: Float32Array;
  /** Genre ordinals of the source and the target. */
  readonly genres: Float32Array;
  /** Brightness in [0.2, 1], growing with community votes. */
  readonly weights: Float32Array;
}

export function buildArcInstances(
  index: CrossReferenceIndex,
  linkIds: ArrayLike<number>,
  verseGenres: Uint8Array,
): ArcInstances {
  const count = linkIds.length;
  const endpoints = new Float32Array(count * 2);
  const genres = new Float32Array(count * 2);
  const weights = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const id = elementAt(linkIds, i);
    const source = elementAt(index.sources, id);
    const targetStart = elementAt(index.targetStarts, id);
    const targetEnd = elementAt(index.targetEnds, id);
    endpoints[i * 2] = source + 0.5;
    endpoints[i * 2 + 1] = (targetStart + targetEnd + 1) / 2;
    genres[i * 2] = elementAt(verseGenres, source);
    genres[i * 2 + 1] = elementAt(verseGenres, targetStart);
    weights[i] = voteWeight(elementAt(index.votes, id));
  }
  return { count, endpoints, genres, weights };
}

/** What a link does when the filter changes: drops out, stays, or joins (see `ArcMorph`). */
export const LEAVING = -1;
export const STAYING = 0;
export const JOINING = 1;

/**
 * A change of the links shown, as one set the shader can morph: the links of both sets, each
 * marked as leaving, staying or joining. One buffer for the whole change, so a morph only ever
 * moves a uniform.
 */
export interface ArcMorph {
  readonly instances: ArcInstances;
  /** Per link: `LEAVING`, `STAYING` or `JOINING`. */
  readonly states: Float32Array;
  /** How many links were shown before, and are after. */
  readonly before: number;
  readonly after: number;
}

/** The change from links `before` to links `after`, both in dataset order (as `selectLinks`). */
export function buildArcMorph(
  index: CrossReferenceIndex,
  before: Int32Array,
  after: Int32Array,
  verseGenres: Uint8Array,
): ArcMorph {
  const ids = new Int32Array(before.length + after.length);
  const states = new Float32Array(ids.length);
  let count = 0;
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const was = before[i] ?? Infinity;
    const is = after[j] ?? Infinity;
    ids[count] = Math.min(was, is);
    states[count] = was === is ? STAYING : was < is ? LEAVING : JOINING;
    if (was <= is) i += 1;
    if (is <= was) j += 1;
    count += 1;
  }
  return {
    instances: buildArcInstances(index, ids.subarray(0, count), verseGenres),
    states: states.slice(0, count),
    before: before.length,
    after: after.length,
  };
}

/** Whether a morph changes anything: some link leaves or joins. */
export function morphChanges(morph: ArcMorph): boolean {
  return morph.instances.count !== morph.before || morph.instances.count !== morph.after;
}

/** The links a morph ends on: the ones that stayed or joined. */
export function settleArcMorph({ instances, states }: ArcMorph): ArcInstances {
  let count = 0;
  for (const state of states) {
    if (state !== LEAVING) count += 1;
  }
  if (count === instances.count) {
    return instances;
  }
  const endpoints = new Float32Array(count * 2);
  const genres = new Float32Array(count * 2);
  const weights = new Float32Array(count);
  let kept = 0;
  for (let i = 0; i < instances.count; i += 1) {
    if (states[i] === LEAVING) continue;
    endpoints.set(instances.endpoints.subarray(i * 2, i * 2 + 2), kept * 2);
    genres.set(instances.genres.subarray(i * 2, i * 2 + 2), kept * 2);
    weights[kept] = elementAt(instances.weights, i);
    kept += 1;
  }
  return { count, endpoints, genres, weights };
}
