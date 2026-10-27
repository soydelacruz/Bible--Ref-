import { describe, expect, it } from 'vitest';
import { clearStart, closeUpView, framingView } from './tour-framing.ts';

const TOTAL = 31_102;

describe('closeUpView', () => {
  it('centers a verse among a few books’ worth of its neighbours', () => {
    expect(closeUpView({ start: 5090, end: 5090 }, TOTAL)).toEqual({ start: 4640.5, end: 5540.5 });
  });

  it('keeps a long passage whole, with room to spare', () => {
    const view = closeUpView({ start: 1000, end: 1149 }, TOTAL);
    expect(view.end - view.start).toBe(150 * 12);
    expect((view.start + view.end) / 2).toBe(1075);
  });

  it('stays inside the canon at its very start', () => {
    expect(closeUpView({ start: 0, end: 0 }, TOTAL)).toEqual({ start: 0, end: 900 });
  });
});

describe('framingView', () => {
  it('shows every range with a tenth of their extent to spare on either side', () => {
    const view = framingView(
      [
        { start: 18_712, end: 18_723 },
        { start: 27_000, end: 27_001 },
      ],
      TOTAL,
    );
    const extent = 27_002 - 18_712;
    expect(view.start).toBeCloseTo(18_712 - extent / 10);
    expect(view.end).toBeCloseTo(27_002 + extent / 10);
  });

  it('takes the ranges in any order', () => {
    const forward = framingView(
      [
        { start: 100, end: 100 },
        { start: 900, end: 900 },
      ],
      TOTAL,
    );
    const backward = framingView(
      [
        { start: 900, end: 900 },
        { start: 100, end: 100 },
      ],
      TOTAL,
    );
    expect(backward).toEqual(forward);
  });

  it('stays inside the canon when the margin would run past an end', () => {
    expect(
      framingView(
        [
          { start: 0, end: 0 },
          { start: 26_045, end: 26_045 },
        ],
        TOTAL,
      ).start,
    ).toBe(0);
  });
});

describe('clearStart', () => {
  it('moves what the view showed past the share of the axis that is covered', () => {
    const view = clearStart({ start: 1000, end: 1800 }, 0.2, TOTAL);
    expect(view).toEqual({ start: 800, end: 1800 });
    // The old start now lies a fifth of the way along.
    expect((1000 - view.start) / (view.end - view.start)).toBeCloseTo(0.2);
  });

  it('leaves the view alone when nothing is covered', () => {
    const view = { start: 10, end: 20 };
    expect(clearStart(view, 0, TOTAL)).toBe(view);
  });

  it('can only widen at the start of the canon', () => {
    expect(clearStart({ start: 0, end: 900 }, 0.25, TOTAL)).toEqual({ start: 0, end: 1200 });
  });
});
