/**
 * Ground made from noise: a hole's heights as a smooth, rolling surface, the
 * same for a seed every time, and never steeper than the physics allows. What
 * a hole's `terrain` is when it is not drawn a digit a tile: digits are half a
 * unit apart, and a ground quantised to them is a smooth curve with a ripple
 * over it, a third as big as the slope itself, which shades as a rash.
 *
 * The noise is Perlin's: a gradient at each lattice point, blended with the
 * quintic that has no second derivative at the edge of a cell, so the ground
 * has no crease anywhere, and the physics' own smoothing of it has none to
 * add. A feel is the noise's shape: how big its swells are, and whether there
 * is small detail on them. A hole's steepness is how steep the steepest step
 * between neighbouring tiles is, as a share of the physics' limit, so the
 * same figure means the same on any feel. The tee and the cup are left on
 * flat plateaus, so a ball rests on the one and beside the other.
 *
 * Arithmetic only: it is handed a layout and a spec, and writes nothing.
 */
import { TILE, type Layout } from './arena';

/** A hash of a seed and a lattice point, 32 bits: every gradient's direction is read from it, so nothing has to remember a state. */
function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Perlin's fade: a curve with no slope and no bend at either end, so cells meet without a crease. */
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Two-dimensional gradient noise for a seed: nought at every lattice point,
 * about a half either way between them, smooth everywhere and the same every
 * time. The lattice is one unit across; the caller scales.
 */
export function gradientNoise(seed: number): (x: number, y: number) => number {
  const dot = (ix: number, iy: number, x: number, y: number) => {
    const a = (hash(seed, ix, iy) / 4294967296) * Math.PI * 2;
    return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy);
  };
  return (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const u = fade(x - ix),
      v = fade(y - iy);
    const a = dot(ix, iy, x, y),
      b = dot(ix + 1, iy, x, y),
      c = dot(ix, iy + 1, x, y),
      d = dot(ix + 1, iy + 1, x, y);
    return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
  };
}

/** One layer of noise: how many tiles across its features are, and how much it counts. */
interface Octave {
  size: number;
  weight: number;
}

/**
 * How each feel is made, and it is the whole of what tells them apart. A
 * gentle ground is a broad swell a ball rests on wherever it lies; a rolling
 * one a swell of the size of the hole's width; a choppy one small bumps, on a
 * swell that is small itself; and rolling and choppy a broad swell with detail
 * as big as the choppy's over it. The grid, a height a tile, is what limits
 * how choppy it can be: nothing smaller than about three tiles can be drawn.
 */
export const FEELS = {
  gentle: { swell: { size: 8, weight: 1 } },
  rolling: { swell: { size: 6, weight: 1 } },
  choppy: { swell: { size: 3, weight: 1 }, detail: { size: 2.5, weight: 0.8 } },
  'rolling and choppy': { swell: { size: 7, weight: 1 }, detail: { size: 3, weight: 1 } },
} as const satisfies Record<string, { swell: Octave; detail?: Octave }>;

export type Feel = keyof typeof FEELS;

/** A ground: its seed, its feel, and how steep its steepest step is, as a share of the physics' limit, from nought to one. */
export interface GroundSpec {
  seed: number;
  feel: Feel;
  steepness: number;
}

/**
 * How far from the tee and from the cup the ground is flat, and how far it
 * takes to come back to the noise, in tiles. Flat is the height the noise had
 * there, so there is no step to it. The cup's plateau reaches past the two
 * balls' width beyond its rim that a ball needs to lie there, with the
 * physics' smoothing, which reaches two tiles, to spare.
 */
const FLAT = { inner: 1.5, outer: 3.2 } as const;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The heights of a hole's tiles, row by row from the south as its layout has
 * them, from noise: at least nought and the lowest exactly nought, the steepest
 * step between neighbours exactly `steepness` of the physics' limit of half a
 * tile, and flat round the tee and the cup.
 */
export function noiseGround(layout: Layout, { seed, feel, steepness }: GroundSpec): Float32Array {
  if (!(steepness > 0 && steepness < 1))
    throw new RangeError(`a ground's steepness is between nought and one, not ${steepness}`);
  const { cols, rows } = layout;
  const { swell, ...rest } = FEELS[feel];
  const detail: Octave | undefined = 'detail' in rest ? rest.detail : undefined;
  const big = gradientNoise(seed),
    small = gradientNoise(seed + 7919);
  const h = new Float64Array(cols * rows);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++)
      h[ty * cols + tx] =
        swell.weight * big(tx / swell.size, ty / swell.size) +
        (detail ? detail.weight * small(tx / detail.size, ty / detail.size) : 0);
  // the tee and the cup, each on a plateau at the height the noise had at its middle, that the noise comes back to over a
  // couple of tiles: a smooth blend, so the plateau has no edge
  for (const at of [layout.tee, layout.cup]) {
    const cx = (at.x - layout.originX) / TILE - 0.5,
      cy = (at.y - layout.originY) / TILE - 0.5;
    const level = h[Math.round(cy) * cols + Math.round(cx)];
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++) {
        const w = smoothstep(FLAT.inner, FLAT.outer, Math.hypot(tx - cx, ty - cy));
        h[ty * cols + tx] = level + (h[ty * cols + tx] - level) * w;
      }
  }
  // scaled so the steepest step between neighbours is the share asked for of the physics' limit, half a tile
  let steepest = 0;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      if (tx + 1 < cols) steepest = Math.max(steepest, Math.abs(h[ty * cols + tx + 1] - h[ty * cols + tx]));
      if (ty + 1 < rows) steepest = Math.max(steepest, Math.abs(h[(ty + 1) * cols + tx] - h[ty * cols + tx]));
    }
  const k = steepest > 0 ? (steepness * (TILE / 2)) / steepest : 0;
  const lowest = Math.min(...h);
  // the lowest exactly nought, though the arithmetic may leave it a rounding off
  return Float32Array.from(h, (v) => Math.max(0, (v - lowest) * k));
}
