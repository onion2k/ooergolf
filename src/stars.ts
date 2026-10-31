/**
 * The Moon's sky, which only the fly-in sees: where its stars are and where the Earth hangs, worked out from the hole's name by a
 * hash and nothing else (never the game's chance, never the clock), so the same hole has the same sky every time and a picture of it
 * is the same every run. Stars are points on a dome round the hole's middle, above the horizon, each with a size and a brightness;
 * the Earth is one place on the same dome, low over the hills. The page draws them (`models/moon.ts`) to a view that sees the sky.
 */
import { hashed } from './random';

/** How many stars a sky has, how far out the dome stands (inside the far plane the fly-in draws to), and how high above the horizon stars and the Earth go, in radians. */
export const SKY = { stars: 500, dome: 2400, least: 0.07, most: 1.35, earth: { radius: 60, rise: 0.09 } } as const;

/** A number from a name: FNV-1a, so the same name always makes the same sky. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** One star: its heading round the dome, how high it is, how wide it is across in units, and how bright, from nought to one. */
export interface Star {
  azimuth: number;
  rise: number;
  size: number;
  brightness: number;
}

/** Star `i` of the sky of the hole called `name`: a function of the two alone. */
export function starAt(name: string, i: number): Star {
  const seed = seedOf(`${name} stars`);
  const u = hashed(seed, i, 1),
    v = hashed(seed, i, 2);
  return {
    azimuth: u * Math.PI * 2,
    // an even spread over the dome's area, by the sine of the rise, from the horizon's edge to near the zenith
    rise: Math.asin(Math.sin(SKY.least) + v * (Math.sin(SKY.most) - Math.sin(SKY.least))),
    size: 2.2 + hashed(seed, i, 3) ** 2 * 7,
    brightness: 0.35 + 0.65 * hashed(seed, i, 4) ** 2,
  };
}

/** Every star of the sky of `name`. */
export const starsOf = (name: string): Star[] => Array.from({ length: SKY.stars }, (_, i) => starAt(name, i));

/**
 * Where the Earth hangs over the hole called `name`, whose way from tee to cup runs along `heading` (radians): a little to one side
 * of the way the fly-in looks (a little to the left of the middle, where the sky is clear of the buttons and the map on a phone, and
 * by a hundredth of a radian either way from the name's hash), and its height above the horizon (the same
 * for every hole).
 */
export function earthAt(name: string, heading: number): { azimuth: number; rise: number } {
  return { azimuth: heading - 0.035 + (hashed(seedOf(`${name} earth`), 7) - 0.5) * 0.04, rise: SKY.earth.rise };
}
