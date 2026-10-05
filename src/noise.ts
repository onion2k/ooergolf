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
 * flat plateaus, so a ball rests on the one and beside the other; and a hole
 * may ask for level discs, a pond's bed at nought and a bunker's at its own
 * height, made in the same way and before the steepness is set.
 *
 * Arithmetic only: it is handed a layout and a spec, and writes nothing.
 */
import { TILE, slopeAt, type Layout } from './arena';

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
  hills: { swell: { size: 30, weight: 1 } },
  'long hills': { swell: { size: 45, weight: 1 }, detail: { size: 12, weight: 0.25 } },
} as const satisfies Record<string, { swell: Octave; detail?: Octave }>;

export type Feel = keyof typeof FEELS;

/**
 * A disc of level ground, in tiles from the west and from the south, its middle at (`x`, `y`) and its radius `r`: a pond
 * or a bunker's bed. It is level at the height the ground had at its middle, or, with `floor`, at the lowest the ground
 * goes, which is nought, where water lies.
 */
export interface Flat {
  x: number;
  y: number;
  r: number;
  floor?: boolean;
  /**
   * How many tiles past its level ground the disc takes to come back to the noise: two unless it is told. A pond's bed at
   * nought on high hills wants as many tiles as the hills have swell, or the step from bed to bank is the steepest in the
   * hole and the hills round it are scaled flat to make it what was asked.
   */
  blend?: number;
}

/** A ground: its seed, its feel, how steep its steepest step is, as a share of the physics' limit, from nought to one, and any level discs in it. */
export interface GroundSpec {
  seed: number;
  feel: Feel;
  steepness: number;
  flats?: readonly Flat[];
  /**
   * How much higher the hills are made than `steepness` alone would make them, one or more (one is the ground as it always
   * was, byte for byte). The ground is scaled to `steepness`, multiplied by this, and then every tile is lowered to the
   * highest ground that has no step past what `steepness` allows (`lowerToLimit`): the hills stand taller, and what is
   * steeper than the limit is cut into a cliff's worth of the steepest ground the physics takes, never a step more.
   */
  heighten?: number;
}

/** How far past its radius a level disc is quite level, and how far past that the ground comes back to the noise, in tiles. */
export const FLATS = { inner: 0.5, outer: 2.5 } as const;

/**
 * How far from the tee and from the cup the ground is flat, and how far it
 * takes to come back to the noise, in tiles. Flat is the height the noise had
 * there, so there is no step to it. The cup's plateau reaches past the two
 * balls' width beyond its rim that a ball needs to lie there, with the
 * physics' smoothing, which reaches two tiles, to spare.
 */
const FLAT = { inner: 1.5, outer: 3.2 } as const;

/** The smooth step from nought at `a` to one at `b`, with no slope at either end: how a level disc, a plateau and a contour's window blend into what is round them. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The heights of a hole's tiles, row by row from the south as its layout has
 * them, from noise: at least nought and the lowest exactly nought, the steepest
 * step between neighbours exactly `steepness` of the physics' limit of half a
 * tile, and flat round the tee and the cup.
 */
export function noiseGround(
  layout: Layout,
  { seed, feel, steepness, flats = [], heighten = 1 }: GroundSpec,
): Float32Array {
  if (!(steepness > 0 && steepness < 1))
    throw new RangeError(`a ground's steepness is between nought and one, not ${steepness}`);
  if (!(heighten >= 1 && Number.isFinite(heighten)))
    throw new RangeError(`a ground's heighten is a finite number from one, not ${heighten}`);
  for (const { x, y, r, blend } of flats) {
    if (!(r > 0 && x >= 0 && y >= 0 && x <= layout.cols - 1 && y <= layout.rows - 1))
      throw new RangeError(
        `a level disc of radius ${r} at ${x},${y} is not on a ground of ${layout.cols} by ${layout.rows} tiles`,
      );
    if (blend !== undefined && !(blend > 0 && Number.isFinite(blend)))
      throw new RangeError(`a level disc's blend is a number of tiles above nought, not ${blend}`);
  }
  const { cols, rows } = layout;
  const { swell, ...rest } = FEELS[feel];
  const detail: Octave | undefined = 'detail' in rest ? rest.detail : undefined;
  const big = gradientNoise(seed),
    small = gradientNoise(seed + 7919);
  const h = new Float64Array(cols * rows);
  let lowestNoise = Infinity;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      h[ty * cols + tx] =
        swell.weight * big(tx / swell.size, ty / swell.size) +
        (detail ? detail.weight * small(tx / detail.size, ty / detail.size) : 0);
      lowestNoise = Math.min(lowestNoise, h[ty * cols + tx]);
    }
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
  // the level discs, made as the plateaus are, and before the scale is found, so it holds whatever is levelled: each at
  // the height the ground has at its middle, or at the lowest the noise reached, which the ground is brought to nought
  // from, so water lies exactly at the ground's floor. Their levels are fixed first, and every disc's own ground put
  // back level last, so that a disc's blend into the noise never lifts another's, however near they lie
  // where the plateaus are, for `heighten` to hold them level again
  const plateaus: [number, number, number][] = [layout.tee, layout.cup].map((at) => [
    (at.x - layout.originX) / TILE - 0.5,
    (at.y - layout.originY) / TILE - 0.5,
    FLAT.inner,
  ]);
  const levels = flats.map(({ x, y, floor }) => (floor ? lowestNoise : h[Math.round(y) * cols + Math.round(x)]));
  flats.forEach(({ x, y, r, blend }, i) => {
    const outer = blend === undefined ? r + FLATS.outer : r + FLATS.inner + blend;
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++) {
        const w = smoothstep(r + FLATS.inner, outer, Math.hypot(tx - x, ty - y));
        h[ty * cols + tx] = levels[i] + (h[ty * cols + tx] - levels[i]) * w;
      }
  });
  flats.forEach(({ x, y, r }, i) => {
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++)
        if (Math.hypot(tx - x, ty - y) <= r + FLATS.inner) h[ty * cols + tx] = levels[i];
  });
  // scaled so the steepest step between neighbours is the share asked for of the physics' limit, half a tile
  let steepest = 0,
    lowest = Infinity;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      // the lowest by a loop, since a hole of a hundred thousand tiles is more than a call can be given
      lowest = Math.min(lowest, h[ty * cols + tx]);
      if (tx + 1 < cols) steepest = Math.max(steepest, Math.abs(h[ty * cols + tx + 1] - h[ty * cols + tx]));
      if (ty + 1 < rows) steepest = Math.max(steepest, Math.abs(h[(ty + 1) * cols + tx] - h[ty * cols + tx]));
    }
  const k = steepest > 0 ? (steepness * (TILE / 2)) / steepest : 0;
  if (heighten === 1) {
    // the lowest exactly nought, though the arithmetic may leave it a rounding off
    return Float32Array.from(h, (v) => Math.max(0, (v - lowest) * k));
  }
  // taller, and then cut: every tile lowered to the exact lower envelope under the cap, with each plateau and disc held
  // level, which is what the old ground's flat places were before the scale and are again after it
  for (let t = 0; t < h.length; t++) h[t] = Math.max(0, (h[t] - lowest) * k * heighten);
  const groups = levelGroups(layout, plateaus, flats);
  lowerToLimit(h, cols, rows, (steepness * TILE) / 2, groups);
  return Float32Array.from(h);
}

/** The tiles of each plateau and disc that stay level, as lists of indices: a tile is in the last that levelled it, so a disc over a plateau leaves the rest of it as it was. */
function levelGroups(
  layout: Layout,
  plateaus: readonly (readonly [number, number, number])[],
  flats: readonly Flat[],
): number[][] {
  const { cols, rows } = layout;
  const owner = new Int32Array(cols * rows).fill(-1);
  const discs = [...plateaus, ...flats.map(({ x, y, r }) => [x, y, r + FLATS.inner] as const)];
  discs.forEach(([x, y, reach], i) => {
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++) if (Math.hypot(tx - x, ty - y) <= reach) owner[ty * cols + tx] = i;
  });
  const groups: number[][] = discs.map(() => []);
  for (let t = 0; t < owner.length; t++) if (owner[t] >= 0) groups[owner[t]].push(t);
  return groups.filter((g) => g.length > 1);
}

/** The most rounds `lowerToLimit` may take: it is a handful in practice (a test bounds it), and a ground that needed more would be a loop and not a ground. */
export const CUT_ROUNDS = 64;

/**
 * Lowers heights, in place, to the highest ground under them that has no step between side-by-side tiles of more than
 * `cap`, and in which each of the `groups` of tiles (a plateau, a level disc) is level: the exact lower envelope, which
 * two sweeps over the four neighbours give (`h[i] = min(h[i], h[neighbour] + cap)`, forward then backward) and a group's
 * levelling is then held to by lowering it to its lowest tile and sweeping again, until nothing changes. Heights only fall,
 * and a tile never falls below the lowest it was, so the lowest stays where it was. Returns how many rounds it took, which
 * is what a test bounds; one that runs out of them throws, since the ground it left would not be a limit.
 */
export function lowerToLimit(
  h: Float64Array,
  cols: number,
  rows: number,
  cap: number,
  groups: readonly (readonly number[])[],
): number {
  for (let round = 1; round <= CUT_ROUNDS; round++) {
    let changed = false;
    const lower = (t: number, from: number) => {
      const v = h[from] + cap;
      if (v < h[t]) {
        h[t] = v;
        changed = true;
      }
    };
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++) {
        const t = ty * cols + tx;
        if (tx > 0) lower(t, t - 1);
        if (ty > 0) lower(t, t - cols);
      }
    for (let ty = rows - 1; ty >= 0; ty--)
      for (let tx = cols - 1; tx >= 0; tx--) {
        const t = ty * cols + tx;
        if (tx + 1 < cols) lower(t, t + 1);
        if (ty + 1 < rows) lower(t, t + cols);
      }
    for (const group of groups) {
      let least = Infinity;
      for (const t of group) least = Math.min(least, h[t]);
      for (const t of group)
        if (h[t] > least) {
          h[t] = least;
          changed = true;
        }
    }
    if (!changed) return round;
  }
  throw new RangeError(`the ground was not cut to its limit in ${CUT_ROUNDS} rounds`);
}

/**
 * The shape of a green's contour, in tiles: the cup's own level ground (nothing at all within `cup[0]` of it, the swells
 * come on by `cup[1]`, so a putt that is nearly there is not turned and the physics' smoothing, which reaches two tiles,
 * still finds the cup flat), how far in from the green's edge the swells die away (`fall`: they are nought at the edge, so
 * the green joins the ground round it without a step), and how big its swells and its smaller swales are, across.
 *
 * And the tilt. Swells alone cancel: a ball's sideways pull changes sign along a putt, so at the scale of this game (a
 * three-yard cup) the break was nought and the contour only decoration. A green that is tilted as a whole, a plane
 * through the cup's height whose direction is any way round and chosen from the hole's seed, pulls every putt the same
 * way along the whole of its line, as a real green's cross slope does. `tilt` is the share of the contour's peak slope
 * the plane has (the rest is the swells', which are laid on it and break it up into something to read), found by
 * measuring: at 0.8, the Links' greens break their putts a median 0.7 yards and p90 1.9 (`test/contour.test.ts`). The
 * plane is not windowed at the cup (a window on a plane is a dimple, and a ball would roll round the cup), and a ball
 * struck dead at the cup still drops there at every speed of green, which the tests hold.
 */
export const CONTOUR = { cup: [1.2, 3.2], fall: 2.2, swell: 6, swale: 3.5, swaleWeight: 0.4, tilt: 0.8 } as const;

/** What a green's contour is made on: where it lies, how big, and how steep it is to be. */
export interface ContourSpec {
  seed: number;
  /** The cup, in tiles from the west and from the south. */
  x: number;
  y: number;
  /** The green's radius from the cup, in tiles: the swells are nought from it outward. */
  radius: number;
  /**
   * How far from the cup the tilt carries on, in tiles, past the green and its fringe to wherever the hole's plate
   * rejoins the hills, which does the tapering (the tilt is nought only from here, and eased to it over two tiles, so
   * the field has an end of its own). Defaults to the green's radius, where it is a tilt of the green alone.
   */
  reach?: number;
  /** The share of the peak slope that is the tilt's, from nought (the swells alone) to one (a plane alone); `CONTOUR.tilt` if left out. */
  tilt?: number;
  /** The steepest slope, rise over run, the ground may have at the middle of any of `tiles`, which is what the field is scaled to. */
  slope: number;
  /** The tiles, by index, that the slope is measured over: the green's own. */
  tiles: readonly number[];
}

/** The way a green's tilt runs uphill, as an angle from east, from the hole's seed alone: any way round, never the game's chance. */
export function tiltAngle(seed: number): number {
  return (hash(seed, 11, 13) / 4294967296) * Math.PI * 2;
}

/**
 * How much higher or lower than the green's level each tile is, for a green's tilt, swells and swales: a plane through the
 * cup rising along `tiltAngle(seed)`, and smooth noise of two sizes laid over the green, brought to nothing at the cup and at
 * the green's edge (a smooth window, so there is no step), weighted `CONTOUR.tilt` to the plane and the rest to the noise,
 * and scaled so that the steepest slope over `tiles`, as the game reads it (`slopeAt`, the physics' own smoothing of the
 * heights), is `slope` and no other. The slope is linear in the heights, so what is found by measuring the field laid on
 * level ground is what it will be laid on a hole's, whatever height the green stands at. The values go either side of
 * nought: lifting the green to keep them above the floor is the caller's. Pure and seeded, and nought for a slope of
 * nought. Without the window the swells would be a green's whole slope at its edge, and the edge a ledge.
 */
export function greenContour(layout: Layout, spec: ContourSpec): Float32Array {
  const { seed, x, y, radius, slope, tiles } = spec;
  const reach = Math.max(radius, spec.reach ?? radius);
  if (!(spec.tilt === undefined || (spec.tilt >= 0 && spec.tilt <= 1)))
    throw new RangeError(`a green's tilt is a share from nought to one, not ${spec.tilt}`);
  if (!(slope >= 0 && Number.isFinite(slope)))
    throw new RangeError(`a green's slope is a number from nought, not ${slope}`);
  const { cols, rows } = layout;
  const swells = new Float64Array(cols * rows),
    plane = new Float64Array(cols * rows);
  if (slope === 0) return Float32Array.from(swells);
  const swell = gradientNoise(seed * 7 + 3),
    swale = gradientNoise(seed * 7 + 5);
  const [inner, outer] = CONTOUR.cup;
  const angle = tiltAngle(seed);
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const d = Math.hypot(tx - x, ty - y);
      if (d >= reach) continue;
      // a plane of slope one: a tile's width of rise a tile
      plane[ty * cols + tx] = TILE * ((tx - x) * ux + (ty - y) * uy) * (1 - smoothstep(reach - 2, reach, d));
      if (d >= radius) continue;
      const window = smoothstep(inner, outer, d) * (1 - smoothstep(radius - CONTOUR.fall, radius, d));
      // + 0, since a window of nought times a negative is minus nought
      swells[ty * cols + tx] =
        window *
          (swell(tx / CONTOUR.swell, ty / CONTOUR.swell) +
            CONTOUR.swaleWeight * swale(tx / CONTOUR.swale, ty / CONTOUR.swale)) +
        0;
    }
  // the peak slope over the tiles of a field laid on ground that cannot be below nought, to read it as the game does
  const peak = (field: Float64Array) => {
    let lowest = 0;
    for (const v of field) lowest = Math.min(lowest, v);
    const lifted = { ...layout, terrain: Float32Array.from(field, (v) => v - lowest) };
    let steepest = 0;
    for (const t of tiles) {
      const [sx, sy] = slopeAt(
        lifted,
        layout.originX + ((t % cols) + 0.5) * TILE,
        layout.originY + (Math.floor(t / cols) + 0.5) * TILE,
      );
      steepest = Math.max(steepest, Math.hypot(sx, sy));
    }
    return steepest;
  };
  const swellPeak = peak(swells);
  const share = spec.tilt ?? CONTOUR.tilt;
  const field = Float64Array.from(
    swells,
    (v, t) => (swellPeak > 0 ? ((1 - share) * v) / swellPeak : 0) + share * plane[t],
  );
  const steepest = peak(field);
  const k = steepest > 0 ? slope / steepest : 0;
  return Float32Array.from(field, (v) => v * k);
}
