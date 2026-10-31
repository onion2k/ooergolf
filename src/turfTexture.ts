/**
 * The turf texture: the grain of mown grass as texels, for the renderer to lay under the colour of the ground by world
 * position. Pure arithmetic with no page in it, so a test can hold it tileable and neutral: without the first a seam shows
 * at every repeat of the ground, and without the second the green drifts darker or lighter than the palette says, and the
 * look's floors with it. The colour is a modulation about mid-grey (128 changes nothing) and the alpha a height about it.
 */
import { seeded } from './random';

/** The side of the texture the page makes, in texels. */
export const TURF_SIDE = 256;

/**
 * What a texture is of: the mown ground's fine grain, a desert's dry tufts, the Moon's cratered dust, the future's plated
 * metal, and a cracked clay (a dried lake bed's, which Part 6 of the biomes plan lays on the pan). Each is tileable and neutral
 * about mid-grey, as the mown is, and calm: the strengths are the swings below, and what shows of them is the theme's.
 */
export type TurfKind = 'mown' | 'tuft' | 'regolith' | 'plate' | 'crack';

/** Every kind, in the order the page uploads them: the layer of a kind is its place here, counted from one. */
export const TURF_KINDS: readonly TurfKind[] = ['mown', 'tuft', 'regolith', 'plate', 'crack'];

/** The most the colour swings from mid-grey, in levels: a few per cent, since the shader doubles it. */
const COLOUR_SWING = 22;
/** The most the height swings from mid-grey, in levels. */
const HEIGHT_SWING = 40;
/** The same for each kind: the regolith's value noise showed its grid at the sheet's strength and is held to less, and the crack is a few lines. */
const SWING: Record<TurfKind, { colour: number; height: number }> = {
  mown: { colour: COLOUR_SWING, height: HEIGHT_SWING },
  tuft: { colour: 26, height: 46 },
  regolith: { colour: 20, height: 36 },
  plate: { colour: 24, height: 36 },
  crack: { colour: 30, height: 60 },
};

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

/** The distance between two coordinates on a square that wraps at `side`: the shorter way round. */
const wrap = (d: number, side: number) => {
  const a = Math.abs(d) % side;
  return Math.min(a, side - a);
};

/** `count` points on a wrapping square of `side`, each with a third number in [0, 1). */
function points(count: number, side: number, random: () => number): [number, number, number][] {
  return Array.from({ length: count }, () => [random() * side, random() * side, random()]);
}

/** A texel's grain and height at (x, y), about nought and not yet centred. */
type Maker = (x: number, y: number) => [grain: number, height: number];

function makerOf(kind: TurfKind, side: number, random: () => number): Maker {
  const fine = lattice(side / 2, random);
  const tips = lattice(side / 4, random);
  const clump = lattice(8, random);
  const swell = lattice(16, random);
  switch (kind) {
    case 'mown':
      return (x, y) => {
        const u = x / side,
          v = y / side;
        return [0.45 * fine(u, v) + 0.35 * tips(u, v) + 0.4 * clump(u, v), 0.7 * clump(u, v) + 0.3 * swell(u, v)];
      };
    case 'tuft': {
      // dry tufts: a coarser scatter than mown grass, in clumps with bare ground between
      const tuft = lattice(24, random);
      return (x, y) => {
        const u = x / side,
          v = y / side;
        const t = tuft(u, v);
        return [0.35 * fine(u, v) + 0.5 * t + 0.4 * clump(u, v), 0.5 * t * Math.abs(t) + 0.5 * clump(u, v)];
      };
    }
    case 'regolith': {
      // dust with a few soft craters in it, a bowl and a lip, wrapped at the edge. The lattices are kept to scales a grid
      // does not show at (the sheet's value noise showed its grid at strength)
      const craters = points(14, side, random);
      const dust = lattice(side / 8, random);
      return (x, y) => {
        const u = x / side,
          v = y / side;
        let grain = 0.5 * clump(u, v) + 0.4 * dust(u, v) + 0.25 * fine(u, v),
          height = 0.5 * swell(u, v) + 0.3 * dust(u, v);
        for (const [cx, cy, size] of craters) {
          const r = 5 + size * 14;
          const d = Math.hypot(wrap(x - cx, side), wrap(y - cy, side)) / r;
          if (d >= 1.3) continue;
          const bowl = d < 1 ? -((1 - d) ** 2) : 0;
          const lip = Math.max(0, 1 - Math.abs(d - 1) / 0.3) * 0.7;
          grain += (bowl + lip) * 0.9;
          height += (bowl + lip) * 1.4;
        }
        return [grain, height];
      };
    }
    case 'plate': {
      // metal sheet: panels two to a side with a seam and a bevel between them, a rivet in each corner, and a brushed grain
      const cell = side / 2;
      const panel = lattice(2, random);
      const rows = Array.from({ length: side / 4 }, () => lattice(side / 8, random));
      return (x, y) => {
        const px = x % cell,
          py = y % cell;
        const seam = Math.min(px, py, cell - px, cell - py);
        const line = seam < 1.8 ? 1 : 0;
        const bevel = seam < 5 ? 1 - seam / 5 : 0;
        const rivet = Math.hypot(Math.min(px, cell - px) - 9, Math.min(py, cell - py) - 9) < 2.6 ? 1 : 0;
        const brushed = rows[Math.floor(y / 4) % rows.length](x / side, 0);
        const slab = panel(Math.floor(x / cell) / 2 + 0.01, Math.floor(y / cell) / 2 + 0.01);
        return [
          0.35 * slab + 0.3 * brushed + 0.25 * bevel - 1.1 * line + 0.45 * rivet,
          0.35 * bevel - 1.2 * line + 0.6 * rivet,
        ];
      };
    }
    case 'crack': {
      // dried clay: cracks along the edges between the cells of a scatter of points, wrapped at the edge of the square
      const seeds = points(26, side, random);
      return (x, y) => {
        const u = x / side,
          v = y / side;
        let a = Infinity,
          b = Infinity;
        for (const [px, py] of seeds) {
          const d = Math.hypot(wrap(x - px, side), wrap(y - py, side));
          if (d < a) [a, b] = [d, a];
          else if (d < b) b = d;
        }
        const line = b - a < 3.2 ? 1 - (b - a) / 3.2 : 0;
        return [0.4 * clump(u, v) + 0.2 * fine(u, v) - 1.2 * line, 0.2 * clump(u, v) - 1.3 * line];
      };
    }
  }
}

/**
 * A `side` by `side` square of rgba texels, tileable (every lattice wraps at the side), the same for the same arguments
 * and, in colour and in height, mid-grey on average. A mown grain is a fine scatter of blade tips, darker and lighter by a
 * few per cent, over a soft clump at a larger scale; the height is the same clumps, gently. The other kinds are made the same
 * way (see `TurfKind`), each at a swing of its own.
 */
export function turfTexels(side: number, seed: number, kind: TurfKind): Uint8ClampedArray {
  const random = seeded(seed);
  const make = makerOf(kind, side, random);
  const grain = new Float32Array(side * side);
  const height = new Float32Array(side * side);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const [g, h] = make(x, y);
      grain[y * side + x] = g;
      height[y * side + x] = h;
    }
  centred(grain);
  centred(height);
  const swing = SWING[kind];
  const out = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const c = Math.round(128 + grain[i] * swing.colour);
    out[i * 4] = c;
    out[i * 4 + 1] = c;
    out[i * 4 + 2] = c;
    out[i * 4 + 3] = Math.round(128 + height[i] * swing.height);
  }
  return out;
}
