import { describe, expect, it } from 'vitest';
import { GENRES, type GenreId } from '../../core/bible/genres.ts';
import {
  ciede2000,
  contrastRatio,
  deuteranopeLabOf,
  labOf,
  type Lab,
} from '../../test-utils/color-difference.ts';
import { GENRE_COLORS, GENRE_HEX, GENRE_RGB, hexToRgb, VIZ_SURFACE } from './palette.ts';

/** The light theme's `--color-background`, which the legends' keys would sit on in it. */
const LIGHT_BACKGROUND = '#fafaf9';

/** Every pair of genres, with how far apart their colors are as `see` makes them. */
function pairDifferences(see: (hex: string) => Lab) {
  return GENRES.flatMap((first, i) =>
    GENRES.slice(i + 1).map((second) => ({
      pair: `${first.id} / ${second.id}`,
      difference: ciede2000(see(GENRE_COLORS[first.id]), see(GENRE_COLORS[second.id])),
    })),
  );
}

function difference(first: GenreId, second: GenreId): number {
  return ciede2000(labOf(GENRE_COLORS[first]), labOf(GENRE_COLORS[second]));
}

describe('hexToRgb', () => {
  it('splits a colour into channels in [0, 1]', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  });

  it('accepts either case', () => {
    expect(hexToRgb('#AABBCC')).toEqual(hexToRgb('#aabbcc'));
  });

  it('refuses anything that is not a six-digit hex colour', () => {
    for (const bad of ['#fff', 'ffffff', '#gggggg', '', '#ffffff ']) {
      expect(() => hexToRgb(bad)).toThrow(/Invalid hex color/);
    }
  });
});

describe('the genre palette', () => {
  it('has a colour for every genre', () => {
    expect(Object.keys(GENRE_COLORS)).toHaveLength(GENRES.length);
    for (const genre of GENRES) {
      expect(GENRE_COLORS[genre.id]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('indexes the same colours by ordinal for WebGL and for Canvas', () => {
    expect(GENRE_RGB).toHaveLength(GENRES.length);
    expect(GENRE_HEX).toHaveLength(GENRES.length);
    for (const genre of GENRES) {
      expect(GENRE_HEX[genre.ordinal]).toBe(GENRE_COLORS[genre.id]);
      expect(GENRE_RGB[genre.ordinal]).toEqual(hexToRgb(GENRE_COLORS[genre.id]));
    }
  });

  it('gives each genre its own colour', () => {
    expect(new Set(Object.values(GENRE_COLORS)).size).toBe(GENRES.length);
  });

  it('draws on the dark surface the app uses', () => {
    expect(VIZ_SURFACE).toBe('#0d0d0d');
  });
});

describe('telling the genres apart', () => {
  it('keeps every two genres at least 20 apart (CIEDE2000)', () => {
    const tooClose = pairDifferences(labOf).filter(({ difference }) => difference < 20);
    expect(tooClose).toEqual([]);
  });

  it('no longer mistakes Law for the Major Prophets, or the Gospels for the General Epistles', () => {
    expect(difference('law', 'major-prophets')).toBeGreaterThanOrEqual(20);
    expect(difference('gospels', 'general-epistles')).toBeGreaterThanOrEqual(20);
  });

  it('keeps every two genres at least 8 apart for a reader without green cones', () => {
    const tooClose = pairDifferences(deuteranopeLabOf).filter(({ difference }) => difference < 8);
    expect(tooClose).toEqual([]);
  });

  it('stands out from the surface it is drawn on', () => {
    for (const color of Object.values(GENRE_COLORS)) {
      expect(contrastRatio(color, VIZ_SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('stands out from the light background no less than before (2.75:1)', () => {
    for (const color of Object.values(GENRE_COLORS)) {
      expect(contrastRatio(color, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(2.75);
    }
  });
});
