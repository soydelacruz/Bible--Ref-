import type { Passage } from '../../core/bible/passage.ts';

/** A point on screen, in CSS pixels from the viewport's top left corner. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** A box on screen, in CSS pixels from the viewport's top left corner. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Where a view draws a passage: the point a reader's eye goes to (its dot, its verse number, the
 * middle of its stretch of the axis), and the part of the screen where the view draws passages.
 * The point lies outside that part when the passage is scrolled or panned out of sight.
 */
export interface PassageSpot {
  readonly point: ScreenPoint;
  readonly bounds: ScreenBox;
}

/** How a view answers where it draws a passage: `null` when it does not draw it at all. */
export type PassageLocator = (passage: Passage) => PassageSpot | null;

const locators = new Map<Element, PassageLocator>();

/**
 * Says how to find passages in what is drawn inside `element`, until the returned function
 * withdraws it. Read-only: the host asks the views on either side of a switch where the focused
 * passage is, so the passage beacon can travel from one to the other (`src/app/view-switch.ts`).
 */
export function provideLocator(element: Element, locator: PassageLocator): () => void {
  locators.set(element, locator);
  return () => {
    if (locators.get(element) === locator) {
      locators.delete(element);
    }
  };
}

/** Where the view inside `root` draws `passage` now; `null` when it doesn't, or can't say. */
export function locatePassage(root: Element, passage: Passage): PassageSpot | null {
  for (const [element, locator] of locators) {
    if (root.contains(element)) {
      const spot = locator(passage);
      if (spot) {
        return spot;
      }
    }
  }
  return null;
}

/** A box from an element's client rectangle. */
export function screenBox(rect: DOMRectReadOnly): ScreenBox {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** Whether a spot's point is in sight: inside its bounds, edges included. */
export function isInSight({ point, bounds }: PassageSpot): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

/**
 * The point of a spot's bounds, kept `inset` inside its edges, nearest to the spot's point: the
 * point itself when it is in sight, and otherwise the edge on the side where the passage lies.
 */
export function nearestInSight({ point, bounds }: PassageSpot, inset: number): ScreenPoint {
  const clamp = (value: number, low: number, high: number) =>
    low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high);
  return {
    x: clamp(point.x, bounds.left + inset, bounds.right - inset),
    y: clamp(point.y, bounds.top + inset, bounds.bottom - inset),
  };
}
