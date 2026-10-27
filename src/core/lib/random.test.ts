import { describe, expect, it } from 'vitest';
import { seededRandom } from './random.ts';

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, and other numbers for another', () => {
    const take = (random: () => number) => Array.from({ length: 5 }, random);
    expect(take(seededRandom(7))).toEqual(take(seededRandom(7)));
    expect(take(seededRandom(7))).not.toEqual(take(seededRandom(8)));
  });

  it('stays in [0, 1), like Math.random', () => {
    const random = seededRandom(1);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
