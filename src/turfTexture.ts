/**
 * The turf texture: the grain of mown grass as texels, for the renderer to lay under the colour of the ground by world
 * position. Pure arithmetic with no page in it, so a test can hold it tileable and neutral: without the first a seam shows
 * at every repeat of the ground, and without the second the green drifts darker or lighter than the palette says, and the
 * look's floors with it. The colour is a modulation about mid-grey (128 changes nothing) and the alpha a height about it.
 */
import { seeded } from './random';

/** The side of the texture the page makes, in texels. */
export const TURF_SIDE = 256;

/** What a texture is of: the mown ground's fine grain, the one kind there is. */
export type TurfKind = 'mown';

/** The most the colour swings from mid-grey, in levels: a few per cent, since the shader doubles it. */
const COLOUR_SWING = 22;
/** The most the height swings from mid-grey, in levels. */
const HEIGHT_SWING = 40;

/** A lattice of random values, `cells` across and wrapping at the edge, read smoothly between its points. */
function lattice(cells: number, random: () => number): (u: number, v: number) => number {
  const values = new Float32Array(cells * cells);
  for (let i = 0; i < values.length; i++) values[i] = random() * 2 - 1;
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i: number, j: number) =>
      values[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

/** Moves `values` to a mean of nought and a largest swing of one, so the texture neither lightens nor darkens what it is laid on. */
function centred(values: Float32Array): void {
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let most = 0;
  for (let i = 0; i < values.length; i++) {
    values[i] -= mean;
    most = Math.max(most, Math.abs(values[i]));
  }
  for (let i = 0; i < values.length; i++) values[i] /= most || 1;
}

/**
 * A `side` by `side` square of rgba texels, tileable (every lattice wraps at the side), the same for the same arguments
 * and, in colour and in height, mid-grey on average. A mown grain is a fine scatter of blade tips, darker and lighter by a
 * few per cent, over a soft clump at a larger scale; the height is the same clumps, gently.
 */
export function turfTexels(side: number, seed: number, kind: TurfKind): Uint8ClampedArray {
  void kind;
  const random = seeded(seed);
  const fine = lattice(side / 2, random);
  const tips = lattice(side / 4, random);
  const clump = lattice(8, random);
  const swell = lattice(16, random);
  const grain = new Float32Array(side * side);
  const height = new Float32Array(side * side);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const u = x / side;
      const v = y / side;
      grain[y * side + x] = 0.45 * fine(u, v) + 0.35 * tips(u, v) + 0.4 * clump(u, v);
      height[y * side + x] = 0.7 * clump(u, v) + 0.3 * swell(u, v);
    }
  centred(grain);
  centred(height);
  const out = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const c = Math.round(128 + grain[i] * COLOUR_SWING);
    out[i * 4] = c;
    out[i * 4 + 1] = c;
    out[i * 4 + 2] = c;
    out[i * 4 + 3] = Math.round(128 + height[i] * HEIGHT_SWING);
  }
  return out;
}
