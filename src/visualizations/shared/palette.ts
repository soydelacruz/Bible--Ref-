import { GENRES, type GenreId } from '../../core/bible/genres.ts';

/** Background of every visualization (the dark theme's `--color-background`). */
export const VIZ_SURFACE = '#0d0d0d';

/**
 * Genre colors for the dark surface, in canonical genre order: warm Old Testament, cool New
 * Testament.
 *
 * Any two genres can meet in a picture (an arc joins Law to Major Prophets), so every pair is held
 * apart, not only neighbours: at least 20 CIEDE2000 between any two, so each reads as a color of
 * its own rather than a shade of another. Under a deuteranopia simulation every pair keeps at
 * least 8. Each color has at least 4.5:1 contrast against the surface, and no less against the
 * light theme's background than the colors before these. `palette.test.ts` holds these numbers.
 *
 * Measured with the dataviz skill's validator (`--mode dark --surface #0d0d0d`), the adjacent
 * pairs clear its CVD target (8.1, target ≥ 8) and its normal-vision floor (15.0, floor ≥ 15).
 * Five colors sit up to 0.035 lighter (OKLCH) than its dark band: that room is what lets all ten
 * stay 20 apart.
 *
 * Under deuteranopia some pairs are still only 8 apart, so every visualization also encodes genre
 * by position (genres are contiguous runs of books) and by labels.
 */
export const GENRE_COLORS: Readonly<Record<GenreId, string>> = {
  law: '#ff5d93',
  history: '#dc440e',
  poetry: '#cd8b00',
  'major-prophets': '#ce2eca',
  'minor-prophets': '#9a9d4f',
  gospels: '#39a5bf',
  acts: '#008e22',
  'pauline-epistles': '#027ae0',
  'general-epistles': '#04ac90',
  revelation: '#9e85fb',
};

export type Rgb = readonly [red: number, green: number, blue: number];

/** Converts `#rrggbb` into linear-light-agnostic sRGB channels in [0, 1]. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const [, red = '0', green = '0', blue = '0'] = match;
  return [parseInt(red, 16) / 255, parseInt(green, 16) / 255, parseInt(blue, 16) / 255];
}

/** Genre colors as RGB channels, indexed by genre ordinal (for WebGL uniforms). */
export const GENRE_RGB: readonly Rgb[] = GENRES.map((genre) => hexToRgb(GENRE_COLORS[genre.id]));

/** Genre colors as hex strings, indexed by genre ordinal (for Canvas 2D). */
export const GENRE_HEX: readonly string[] = GENRES.map((genre) => GENRE_COLORS[genre.id]);
