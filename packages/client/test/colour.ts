// Colour maths for the art style's tests: CIELAB (D65), LCh, CIEDE2000 and WCAG contrast, from
// sRGB hex colours.

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface Lch {
  readonly l: number;
  /** Chroma: 0 for greys, about 30 and up for clearly coloured. */
  readonly c: number;
  /** Hue angle in degrees, 0 to 360. */
  readonly h: number;
}

const DEG = Math.PI / 180;

/** A hex colour's channels as linear light, 0 to 1. */
function linear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function lab(hex: string): Lab {
  const [r, g, b] = linear(hex);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function lch(hex: string): Lch {
  const { l, a, b } = lab(hex);
  return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) / DEG + 360) % 360 };
}

/** The angle between two hues, 0 to 180 degrees. */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** CIEDE2000 colour difference: about 2 is just noticeable, 10 and up clearly different. */
export function deltaE(x: Lab, y: Lab): number {
  const c7 = (c: number) => c ** 7 / (c ** 7 + 25 ** 7);
  const g = 0.5 * (1 - Math.sqrt(c7((Math.hypot(x.a, x.b) + Math.hypot(y.a, y.b)) / 2)));
  const [a1, a2] = [(1 + g) * x.a, (1 + g) * y.a];
  const [c1, c2] = [Math.hypot(a1, x.b), Math.hypot(a2, y.b)];
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / DEG + 360) % 360);
  const [h1, h2] = [hue(a1, x.b), hue(a2, y.b)];

  let dh = 0;
  if (c1 * c2 !== 0) dh = h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 < -180 ? h2 - h1 + 360 : h2 - h1;
  const dL = y.l - x.l;
  const dC = c2 - c1;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * DEG);

  const l = (x.l + y.l) / 2;
  const c = (c1 + c2) / 2;
  let h = h1 + h2;
  if (c1 * c2 !== 0) h = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const t =
    1 - 0.17 * Math.cos((h - 30) * DEG) + 0.24 * Math.cos(2 * h * DEG) + 0.32 * Math.cos((3 * h + 6) * DEG) - 0.2 * Math.cos((4 * h - 63) * DEG);
  const sl = 1 + (0.015 * (l - 50) ** 2) / Math.sqrt(20 + (l - 50) ** 2);
  const sc = 1 + 0.045 * c;
  const sh = 1 + 0.015 * c * t;
  const rt = -2 * Math.sqrt(c7(c)) * Math.sin(60 * Math.exp(-(((h - 275) / 25) ** 2)) * DEG);
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}
