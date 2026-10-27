import { describe, expect, it } from 'vitest';
import type { AxisView } from './axis-view.ts';
import { FLIGHT_MAX_MS, FLIGHT_MIN_MS, flightDuration, planFlight } from './camera-flight.ts';

const TOTAL = 31102;

const around = (center: number, width: number): AxisView => ({
  start: center - width / 2,
  end: center + width / 2,
});
const centerOf = (view: AxisView) => (view.start + view.end) / 2;
const widthOf = (view: AxisView) => view.end - view.start;

/** The views along a flight, at `steps + 1` evenly spaced moments. */
function sample(from: AxisView, to: AxisView, steps = 100): AxisView[] {
  const flight = planFlight(from, to);
  return Array.from({ length: steps + 1 }, (_, step) => flight.at(step / steps));
}

describe('planFlight', () => {
  it('starts where the camera is and lands exactly on the target', () => {
    const from = around(100, 200);
    const to = around(TOTAL - 100, 200);
    const flight = planFlight(from, to);
    expect(centerOf(flight.at(0))).toBeCloseTo(100, 6);
    expect(widthOf(flight.at(0))).toBeCloseTo(200, 6);
    expect(flight.at(1)).toBe(to);
    expect(centerOf(flight.at(0.999999))).toBeCloseTo(TOTAL - 100, 1);
  });

  it('pulls back to the whole canon between Genesis and Revelation, then dives in', () => {
    const views = sample(around(100, 200), around(TOTAL - 100, 200));
    const widest = Math.max(...views.map(widthOf));
    expect(widest).toBeGreaterThan(TOTAL * 0.9);
    // Widest half way, with the camera half way across.
    const middle = views[50];
    expect(middle && widthOf(middle)).toBeCloseTo(widest, -2);
    expect(middle && centerOf(middle)).toBeCloseTo(TOTAL / 2, -2);
  });

  it('barely zooms for a move to the next screen', () => {
    const views = sample(around(1000, 200), around(1240, 200));
    expect(Math.max(...views.map(widthOf))).toBeLessThan(200 * 1.6);
  });

  it('never zooms in past the narrower end', () => {
    for (const [from, to] of [
      [around(500, 24), around(20000, 3000)],
      [around(20000, 3000), around(500, 24)],
      [around(9000, 800), around(9300, 100)],
    ] as const) {
      const narrowest = Math.min(widthOf(from), widthOf(to));
      for (const view of sample(from, to)) {
        expect(widthOf(view)).toBeGreaterThanOrEqual(narrowest * (1 - 1e-9));
      }
    }
  });

  it('moves the center steadily one way', () => {
    const centers = sample(around(28000, 500), around(3000, 1500)).map(centerOf);
    for (let index = 1; index < centers.length; index += 1) {
      expect(centers[index]).toBeLessThanOrEqual((centers[index - 1] ?? 0) + 1e-6);
    }
  });

  it('zooms in place at an even pace on the screen, as a doubling every equal step', () => {
    const flight = planFlight(around(5000, 1600), around(5000, 100));
    expect(centerOf(flight.at(0.5))).toBeCloseTo(5000, 6);
    // 1600 → 100 is four halvings: half way is two of them.
    expect(widthOf(flight.at(0.5))).toBeCloseTo(400, 6);
    expect(widthOf(flight.at(0.25))).toBeCloseTo(800, 6);
  });

  it('measures a flight the same both ways, and longer the farther it looks', () => {
    const near = planFlight(around(1000, 200), around(1300, 200)).length;
    const far = planFlight(around(1000, 200), around(30000, 200)).length;
    const back = planFlight(around(30000, 200), around(1000, 200)).length;
    expect(far).toBeCloseTo(back, 9);
    expect(far).toBeGreaterThan(near);
    expect(planFlight(around(1000, 200), around(1000, 200)).length).toBe(0);
  });
});

describe('flightDuration', () => {
  it('keeps short flights at the shortest and the farthest at the longest', () => {
    expect(flightDuration(0)).toBe(FLIGHT_MIN_MS);
    expect(flightDuration(0.2)).toBe(FLIGHT_MIN_MS);
    expect(flightDuration(100)).toBe(FLIGHT_MAX_MS);
    expect(FLIGHT_MIN_MS).toBe(300);
    expect(FLIGHT_MAX_MS).toBe(900);
  });

  it('times a flight by how far it looks, between those', () => {
    const genesisToRevelation = planFlight(around(1000, 2000), around(TOTAL - 1000, 2000));
    const nextChapters = planFlight(around(1000, 200), around(1600, 200));
    const long = flightDuration(genesisToRevelation.length);
    const short = flightDuration(nextChapters.length);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(FLIGHT_MIN_MS);
    expect(long).toBeLessThan(FLIGHT_MAX_MS);
  });
});
