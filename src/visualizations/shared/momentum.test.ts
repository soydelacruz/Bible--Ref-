import { describe, expect, it } from 'vitest';
import { COAST_TIME_CONSTANT_MS, isAtRest, rubberBand, stepGlide, type Glide } from './momentum.ts';

/** Steps a glide frame by frame until it rests; returns every position on the way. */
function run(glide: Glide, min: number, max: number, frameMs = 16): number[] {
  const positions = [glide.position];
  let current = glide;
  for (let frame = 0; frame < 1000 && !isAtRest(current, min, max); frame += 1) {
    current = stepGlide(current, frameMs, min, max);
    positions.push(current.position);
  }
  return positions;
}

describe('rubberBand', () => {
  it('shows about half of a small pull, and keeps its direction', () => {
    expect(rubberBand(0, 800)).toBe(0);
    expect(rubberBand(10, 800)).toBeCloseTo(5.5, 0);
    expect(rubberBand(-10, 800)).toBeCloseTo(-rubberBand(10, 800));
  });

  it('resists more the further it is pulled, and never reaches a screen', () => {
    const first = rubberBand(100, 800);
    const second = rubberBand(200, 800) - first;
    const third = rubberBand(300, 800) - rubberBand(200, 800);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
    expect(rubberBand(1e9, 800)).toBeLessThan(800);
  });

  it('shows nothing when there is no room', () => {
    expect(rubberBand(50, 0)).toBe(0);
  });
});

describe('a coast', () => {
  it('slows down by 1/e every time constant', () => {
    const later = stepGlide({ position: 0, velocity: 2 }, COAST_TIME_CONSTANT_MS, -1e6, 1e6);
    expect(later.velocity).toBeCloseTo(2 / Math.E, 9);
  });

  it('travels about speed × time constant in all, the same at any frame rate', () => {
    const fast = run({ position: 0, velocity: 2 }, -1e6, 1e6, 8).at(-1) ?? 0;
    const slow = run({ position: 0, velocity: 2 }, -1e6, 1e6, 33).at(-1) ?? 0;
    // It stops once slower than a pixel every few frames, a few pixels short of the limit.
    const limit = 2 * COAST_TIME_CONSTANT_MS;
    expect(fast).toBeLessThan(limit);
    expect(fast).toBeGreaterThan(limit - 10);
    expect(slow).toBeCloseTo(fast, -1);
  });

  it('only ever moves on, and stops', () => {
    const positions = run({ position: 100, velocity: -1.5 }, -1e6, 1e6);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeLessThanOrEqual(positions[index - 1] ?? 0);
    }
    expect(positions.length).toBeLessThan(200);
  });
});

describe('past an end', () => {
  it('springs back from a release without passing the end', () => {
    const positions = run({ position: -60, velocity: 0 }, 0, 1000);
    for (let index = 1; index < positions.length; index += 1) {
      const position = positions[index] ?? 0;
      expect(position).toBeGreaterThanOrEqual(positions[index - 1] ?? 0);
      expect(position).toBeLessThanOrEqual(0);
    }
    expect(positions.at(-1)).toBeCloseTo(0, 0);
    // Settled in well under half a second.
    expect(positions.length * 16).toBeLessThan(500);
  });

  it('overshoots a little when flicked into an end, then settles on it without bouncing', () => {
    const positions = run({ position: 900, velocity: 3 }, 0, 1000);
    const furthest = Math.max(...positions);
    expect(furthest).toBeGreaterThan(1000);
    expect(furthest).toBeLessThan(1000 + 3 * COAST_TIME_CONSTANT_MS);
    const peak = positions.indexOf(furthest);
    for (let index = peak + 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeLessThanOrEqual(positions[index - 1] ?? 0);
      expect(positions[index]).toBeGreaterThanOrEqual(1000 - 0.5);
    }
  });

  it('carries on coasting back in when flung inward from past an end', () => {
    const positions = run({ position: -20, velocity: 2 }, 0, 1000);
    expect(positions.at(-1)).toBeGreaterThan(50);
  });

  it('is at rest only when still and on or between the ends', () => {
    expect(isAtRest({ position: 500, velocity: 0 }, 0, 1000)).toBe(true);
    expect(isAtRest({ position: 500, velocity: 1 }, 0, 1000)).toBe(false);
    expect(isAtRest({ position: -10, velocity: 0 }, 0, 1000)).toBe(false);
    expect(isAtRest({ position: 1010, velocity: 0 }, 0, 1000)).toBe(false);
    expect(isAtRest({ position: 1000.2, velocity: 0 }, 0, 1000)).toBe(true);
  });
});
