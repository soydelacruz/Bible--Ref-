/**
 * A small deterministic random source (mulberry32): the same seed gives the same numbers, in
 * [0, 1) like `Math.random`. For what must come out the same on every visit, such as the cross's
 * wood grain, and for tests of what is random in the app.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
