import { describe, expect, it } from 'vitest';
import { ciede2000, contrastRatio, deuteranopeLabOf, labOf, type Lab } from './color-difference.ts';

describe('ciede2000', () => {
  // Pairs from Sharma, Wu and Dalal's test data for the formula (2005), with the answers they
  // publish: blues near the rotation term, hues either side of 0° and 180°, and a neutral grey.
  const pairs: readonly (readonly [Lab, Lab, number])[] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  ];

  it('agrees with the published test data', () => {
    for (const [first, second, expected] of pairs) {
      expect(ciede2000(first, second)).toBeCloseTo(expected, 4);
      expect(ciede2000(second, first)).toBeCloseTo(expected, 4);
    }
  });

  it('finds no difference between a colour and itself', () => {
    expect(ciede2000([50, 0, 0], [50, 0, 0])).toBe(0);
    expect(ciede2000(labOf('#3366cc'), labOf('#3366cc'))).toBe(0);
  });
});

describe('labOf', () => {
  it('puts black, white and grey on the neutral axis', () => {
    expect(labOf('#000000')[0]).toBeCloseTo(0, 6);
    for (const hex of ['#ffffff', '#777777']) {
      const [, a, b] = labOf(hex);
      expect(a).toBeCloseTo(0, 2);
      expect(b).toBeCloseTo(0, 2);
    }
    expect(labOf('#ffffff')[0]).toBeCloseTo(100, 2);
  });

  it('places pure red where the standard does', () => {
    const [lightness, a, b] = labOf('#ff0000');
    expect(lightness).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });
});

describe('deuteranopeLabOf', () => {
  it('leaves greys as they are', () => {
    for (const hex of ['#000000', '#808080', '#ffffff']) {
      const seen = deuteranopeLabOf(hex);
      const [lightness] = labOf(hex);
      expect(seen[0]).toBeCloseTo(lightness, 0);
    }
  });

  it('confuses red with green, as a reader without green cones does', () => {
    const red = '#d94a3a';
    const green = '#7a8a22';
    expect(ciede2000(labOf(red), labOf(green))).toBeGreaterThan(30);
    expect(ciede2000(deuteranopeLabOf(red), deuteranopeLabOf(green))).toBeLessThan(10);
  });
});

describe('contrastRatio', () => {
  it('runs from 1 to 21, whichever colour comes first', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});
