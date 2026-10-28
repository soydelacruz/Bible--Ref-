import { afterEach, describe, expect, it, vi } from 'vitest';
import { slidePicture, slideToShow, steadyBox, stretchAround } from './steady-stage.ts';

/** A stage 700 tall without the sheet, whose bottom 300 the sheet's room covers. */
const UNDER_SHEET = { width: 400, height: 700, covered: 300 };
const NO_SHEET = { width: 400, height: 700, covered: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slideToShow', () => {
  it('stays put while what is wanted is already in sight', () => {
    expect(slideToShow({ top: 100, bottom: 200 }, 0, UNDER_SHEET)).toBe(0);
    expect(slideToShow({ top: 250, bottom: 350 }, 120, UNDER_SHEET)).toBe(120);
  });

  it('slides up as little as brings it above the sheet', () => {
    expect(slideToShow({ top: 500, bottom: 600 }, 0, UNDER_SHEET)).toBe(200);
  });

  it('slides back down as little as brings it below the top', () => {
    expect(slideToShow({ top: 50, bottom: 150 }, 200, UNDER_SHEET)).toBe(50);
  });

  it('centres something taller than what shows', () => {
    expect(slideToShow({ top: 100, bottom: 600 }, 0, UNDER_SHEET)).toBe(150);
  });

  it('never slides further than the sheet covers, nor below the top', () => {
    expect(slideToShow({ top: 690, bottom: 800 }, 0, UNDER_SHEET)).toBe(300);
    expect(slideToShow({ top: -80, bottom: 20 }, 100, UNDER_SHEET)).toBe(0);
  });

  it('keeps where it was when nothing is wanted', () => {
    expect(slideToShow(null, 120, UNDER_SHEET)).toBe(120);
  });

  it('comes back down when the sheet goes', () => {
    expect(slideToShow({ top: 500, bottom: 600 }, 200, NO_SHEET)).toBe(0);
  });
});

describe('stretchAround', () => {
  it('keeps a quarter of what shows either side of a point', () => {
    expect(stretchAround(500, UNDER_SHEET)).toEqual({ top: 400, bottom: 600 });
    expect(stretchAround(500, NO_SHEET)).toEqual({ top: 325, bottom: 675 });
  });
});

describe('steadyBox', () => {
  it('is never shorter than the stage would be without the sheet', () => {
    expect(steadyBox(UNDER_SHEET)).toEqual({ minBlockSize: 700 });
  });
});

describe('slidePicture', () => {
  function picture() {
    const element = document.createElement('div');
    const animate = vi.fn();
    element.animate = animate;
    return { element, animate };
  }

  it("slides with the sheet's motion, and back", () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { element, animate } = picture();
    slidePicture(element, 120);
    expect(element.style.transform).toBe('translateY(-120px)');
    expect(element.style.transition).toContain('cubic-bezier(0.32, 0.72, 0, 1)');
    slidePicture(element, 0);
    expect(element.style.transform).toBe('');
    expect(animate).not.toHaveBeenCalled();
  });

  it('moves at once and fades back in for a reader who asked for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { element, animate } = picture();
    slidePicture(element, 80);
    expect(element.style.transform).toBe('translateY(-80px)');
    expect(element.style.transition).toBe('');
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0.4 }, { opacity: 1 }],
      expect.objectContaining({ duration: 200 }),
    );
  });

  it('does nothing when the picture is already there', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { element, animate } = picture();
    slidePicture(element, 0);
    expect(animate).not.toHaveBeenCalled();
  });
});
