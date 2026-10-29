import { hexToRgb, type Rgb } from '../visualizations/shared/palette.ts';

/** A colour in CIELAB (D65): lightness, then the green–red and blue–yellow axes. */
export type Lab = readonly [lightness: number, a: number, b: number];

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

function linearOf(hex: string): Rgb {
  const [red, green, blue] = hexToRgb(hex);
  return [toLinear(red), toLinear(green), toLinear(blue)];
}

function labOfLinear([red, green, blue]: Rgb): Lab {
  // sRGB to XYZ, relative to the D65 white.
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** A `#rrggbb` colour in CIELAB. */
export function labOf(hex: string): Lab {
  return labOfLinear(linearOf(hex));
}

/**
 * Deuteranopia (no green cones) as Machado, Oliveira and Fernandes (2009) model it at full
 * severity: how a `#rrggbb` colour looks to a reader without green cones, in CIELAB.
 */
export function deuteranopeLabOf(hex: string): Lab {
  const [red, green, blue] = linearOf(hex);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return labOfLinear([
    clamp(0.367322 * red + 0.860646 * green - 0.227968 * blue),
    clamp(0.280085 * red + 0.672501 * green + 0.047413 * blue),
    clamp(-0.01182 * red + 0.04294 * green + 0.968881 * blue),
  ]);
}

const DEGREES = Math.PI / 180;

/** A hue angle in degrees, in [0, 360). */
function hueOf(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const angle = Math.atan2(b, a) / DEGREES;
  return angle < 0 ? angle + 360 : angle;
}

/**
 * The CIEDE2000 colour difference (Sharma, Wu and Dalal, 2005). About 1 is the smallest difference
 * an eye notices side by side; at 20 and more two colours read as different colours, not shades.
 */
export function ciede2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const chroma1 = Math.hypot(a1, b1);
  const chroma2 = Math.hypot(a2, b2);
  const meanChroma7 = ((chroma1 + chroma2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(meanChroma7 / (meanChroma7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1 = Math.hypot(a1p, b1);
  const c2 = Math.hypot(a2p, b2);
  const h1 = hueOf(b1, a1p);
  const h2 = hueOf(b2, a2p);
  const neutral = c1 * c2 === 0;

  let hueStep = neutral ? 0 : h2 - h1;
  if (hueStep > 180) hueStep -= 360;
  else if (hueStep < -180) hueStep += 360;
  const deltaL = l2 - l1;
  const deltaC = c2 - c1;
  const deltaH = 2 * Math.sqrt(c1 * c2) * Math.sin((hueStep / 2) * DEGREES);

  const meanL = (l1 + l2) / 2;
  const meanC = (c1 + c2) / 2;
  let meanH = h1 + h2;
  if (!neutral) {
    if (Math.abs(h1 - h2) > 180) meanH += meanH < 360 ? 360 : -360;
    meanH /= 2;
  }
  const t =
    1 -
    0.17 * Math.cos((meanH - 30) * DEGREES) +
    0.24 * Math.cos(2 * meanH * DEGREES) +
    0.32 * Math.cos((3 * meanH + 6) * DEGREES) -
    0.2 * Math.cos((4 * meanH - 63) * DEGREES);
  const meanC7 = meanC ** 7;
  const rotation =
    -Math.sin(2 * 30 * Math.exp(-(((meanH - 275) / 25) ** 2)) * DEGREES) *
    2 *
    Math.sqrt(meanC7 / (meanC7 + 25 ** 7));
  const scaleL = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const lightness = deltaL / scaleL;
  const chroma = deltaC / (1 + 0.045 * meanC);
  const hue = deltaH / (1 + 0.015 * meanC * t);
  return Math.sqrt(lightness ** 2 + chroma ** 2 + hue ** 2 + rotation * chroma * hue);
}

/** WCAG 2's contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const [red, green, blue] = linearOf(hex);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
