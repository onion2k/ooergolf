/**
 * The look as figures: colours sampled from a picture of the course turned
 * into the few numbers `LOOK.md` holds the look to. How much colour the green
 * has, how far the course stands out from the rough round it, how strongly
 * the sun is told from the shade, and how cool the shade is. A picture held
 * to a picture catches any change and says nothing of whether it was for the
 * worse; a picture rewritten for a new stage would carry a greyer look with
 * it unnoticed. These are floors that stay when pictures are written again.
 *
 * Pure arithmetic on sRGB colours of 0 to 255, so it is tested without a
 * page; `look-metrics.spec.ts` samples the picture and reads it by this.
 */

export type Rgb = [number, number, number];

/** What was sampled, by where: the green, the rough, the rail's sunlit top, and its face turned from the sun. */
export interface Samples {
  green: Rgb[];
  rough: Rgb[];
  railTop: Rgb[];
  railShade: Rgb[];
}

/** The figures a picture of the course is held to. */
export interface Figures {
  /** How much colour the green has, 0 for a grey and 1 for a pure colour. */
  saturation: number;
  /** How many times brighter the green is than the rough round it, in light. */
  framing: number;
  /** How many times brighter the rail's sunlit top is than its face in shade, in light. */
  contrast: number;
  /** How much more of the shade's colour is blue than of the sunlit top's: above nought, a shade cooler than the sun. */
  coolShade: number;
}

/** A channel of sRGB, 0 to 255, as linear light, 0 to 1. */
function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** How bright a colour is to the eye, in linear light: the weights of sRGB's own primaries. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** How much colour is in a colour: the spread of its channels over the brightest, as a painter's saturation. */
export function saturation([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** How much of a colour is blue: a third in a grey, more as it is cooled. */
export function blueShare([r, g, b]: Rgb): number {
  const sum = r + g + b;
  return sum === 0 ? 0 : b / sum;
}

/** The middle of some values, and the mean of the middle two when there is an even number. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Each channel's middle value: a sample that lands on a flower in the rough, or a tree's trunk, moves nothing. */
export function medianColour(colours: Rgb[]): Rgb {
  return [0, 1, 2].map((c) => median(colours.map((x) => x[c]))) as Rgb;
}

/** The figures from the samples. */
export function figuresOf(s: Samples): Figures {
  const green = medianColour(s.green),
    rough = medianColour(s.rough),
    top = medianColour(s.railTop),
    shade = medianColour(s.railShade);
  return {
    saturation: median(s.green.map(saturation)),
    framing: luminance(green) / luminance(rough),
    contrast: luminance(top) / luminance(shade),
    coolShade: blueShare(shade) - blueShare(top),
  };
}
