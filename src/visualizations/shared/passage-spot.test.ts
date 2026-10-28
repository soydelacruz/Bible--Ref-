import { afterEach, describe, expect, it, vi } from 'vitest';
import { versePassage } from '../../core/bible/passage.ts';
import {
  isInSight,
  locatePassage,
  nearestInSight,
  provideLocator,
  screenBox,
  type PassageSpot,
} from './passage-spot.ts';

const VERSE = versePassage(26_136);
const BOUNDS = { left: 100, top: 50, right: 500, bottom: 350 };
const spotAt = (x: number, y: number): PassageSpot => ({ point: { x, y }, bounds: BOUNDS });

const withdrawals: (() => void)[] = [];

/** A view's element, inside a root of its own, that answers with `spot`. */
function view(spot: PassageSpot | null) {
  const root = document.createElement('div');
  const stage = document.createElement('div');
  root.append(stage);
  document.body.append(root);
  const locator = vi.fn(() => spot);
  withdrawals.push(provideLocator(stage, locator));
  return { root, stage, locator };
}

afterEach(() => {
  for (const withdraw of withdrawals.splice(0)) {
    withdraw();
  }
});

describe('locatePassage', () => {
  it('asks the view inside the root, and only that one', () => {
    const arcs = view(spotAt(120, 300));
    const threads = view(spotAt(140, 80));
    expect(locatePassage(threads.root, VERSE)).toEqual(spotAt(140, 80));
    expect(threads.locator).toHaveBeenCalledWith(VERSE);
    expect(arcs.locator).not.toHaveBeenCalled();
  });

  it('says nothing for a view that does not draw the passage, or has no way to tell', () => {
    expect(locatePassage(view(null).root, VERSE)).toBeNull();
    expect(locatePassage(document.createElement('div'), VERSE)).toBeNull();
  });

  it('stops asking a view once it withdraws', () => {
    const { root, stage } = view(spotAt(120, 300));
    const withdraw = provideLocator(stage, () => spotAt(1, 1));
    withdraw();
    // Withdrawing an answer that was since replaced leaves the replacement alone.
    const replacement = provideLocator(stage, () => spotAt(2, 2));
    withdraw();
    expect(locatePassage(root, VERSE)).toEqual(spotAt(2, 2));
    replacement();
    expect(locatePassage(root, VERSE)).toBeNull();
  });
});

describe('screenBox', () => {
  it('keeps the edges of a client rectangle', () => {
    expect(screenBox(new DOMRect(10, 20, 30, 40))).toEqual({
      left: 10,
      top: 20,
      right: 40,
      bottom: 60,
    });
  });
});

describe('isInSight', () => {
  it('counts a point inside the bounds, edges included', () => {
    expect(isInSight(spotAt(300, 200))).toBe(true);
    expect(isInSight(spotAt(100, 350))).toBe(true);
  });

  it('does not count one past any side', () => {
    expect(isInSight(spotAt(99, 200))).toBe(false);
    expect(isInSight(spotAt(501, 200))).toBe(false);
    expect(isInSight(spotAt(300, 49))).toBe(false);
    expect(isInSight(spotAt(300, 351))).toBe(false);
  });
});

describe('nearestInSight', () => {
  it('keeps a point in sight where it is', () => {
    expect(nearestInSight(spotAt(300, 200), 20)).toEqual({ x: 300, y: 200 });
  });

  it('brings a point out of sight to the edge on its side, inset', () => {
    expect(nearestInSight(spotAt(2000, 200), 20)).toEqual({ x: 480, y: 200 });
    expect(nearestInSight(spotAt(-50, 200), 20)).toEqual({ x: 120, y: 200 });
    expect(nearestInSight(spotAt(300, 9000), 20)).toEqual({ x: 300, y: 330 });
    expect(nearestInSight(spotAt(300, -10), 20)).toEqual({ x: 300, y: 70 });
  });

  it('keeps a point near an edge clear of it too', () => {
    expect(nearestInSight(spotAt(495, 55), 20)).toEqual({ x: 480, y: 70 });
  });

  it('takes the middle of bounds too narrow for the inset', () => {
    const spot = { point: { x: 0, y: 0 }, bounds: { left: 0, top: 0, right: 30, bottom: 300 } };
    expect(nearestInSight(spot, 20)).toEqual({ x: 15, y: 20 });
  });
});
