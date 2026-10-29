import { useEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A stage's size as if no bottom sheet took room from it, and how much of its bottom the sheet's
 * room covers: 0 without a sheet, and on wide screens, where the details are a side panel.
 */
export interface SteadySize extends ElementSize {
  readonly covered: number;
}

function useObservedSize<Size extends ElementSize>(
  ref: RefObject<HTMLElement | null>,
  initial: Size,
  measure: (element: HTMLElement, box: ElementSize) => Size,
  same: (a: Size, b: Size) => boolean,
): Size {
  const [size, setSize] = useState<Size>(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const next = measure(element, entry.contentRect);
        setSize((current) => (same(current, next) ? current : next));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, measure, same]);
  return size;
}

const NO_SIZE: ElementSize = { width: 0, height: 0 };
const boxSize = (_: HTMLElement, { width, height }: ElementSize): ElementSize => ({
  width,
  height,
});
const sameBox = (a: ElementSize, b: ElementSize) => a.width === b.width && a.height === b.height;

/** The element's content-box size in CSS pixels, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  return useObservedSize(ref, NO_SIZE, boxSize, sameBox);
}

/**
 * The room a phone's bottom sheet keeps below the stage `element` is drawn in, in CSS pixels.
 * The page (`VizPage`) is a `main` stage in a body marked `data-sheet` while it has details to
 * show; on phones the sheet's room is a row below the stage, and elsewhere there is none.
 */
export function sheetRoom(element: Element): number {
  const stage = element.closest('main');
  const body = stage?.parentElement;
  if (!stage || !body?.hasAttribute('data-sheet')) {
    return 0;
  }
  return Math.max(0, body.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom);
}

const NO_STEADY_SIZE: SteadySize = { width: 0, height: 0, covered: 0 };
const steadySize = (element: HTMLElement, { width, height }: ElementSize): SteadySize => {
  const covered = sheetRoom(element);
  return { width, height: height + covered, covered };
};
const sameSteady = (a: SteadySize, b: SteadySize) => sameBox(a, b) && a.covered === b.covered;

/**
 * The stage's size as if the details sheet were not up (see `SteadySize`), for a picture that
 * keeps its orientation and scale when a verse opens on a phone. The sheet takes its room from
 * the stage; a picture laid out at this size stays as it is, lets the sheet cover its lower part,
 * and slides what it needs into sight instead (`slideToShow`).
 */
export function useSteadySize(ref: RefObject<HTMLElement | null>): SteadySize {
  return useObservedSize(ref, NO_STEADY_SIZE, steadySize, sameSteady);
}
