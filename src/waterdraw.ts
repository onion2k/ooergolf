/**
 * A hole's ponds as the title picture draws them: not the blocks of the tiles the physics decides water by, but the smooth
 * curve of them, in a rim of foam, two bands of shallows, the mid water and the deep, each following the curve and, where
 * the water meets ground, the tile's own side. The curve is the 0.45 level set of the water's tile indicator blurred, lowered
 * where a channel a tile wide would else vanish; and a water tile outside it is a low rocky shelf and not blue.
 *
 * Play still decides water a tile at a time (the physics knows no curve), so water is never drawn over a tile that is not
 * water: every piece of it is cut to the water tiles, and a ball that is over a drawn bank is on a bank the physics has.
 *
 * Along the edge stands a ring of small brown stones, packed greedily, touching, one row with a partial second row only
 * against the first. They are scenery, standing in the water tiles, and are worked out from the map alone, by a stream of
 * chance seeded from a hash of it and never the game's: without that the same hole would have a different bank each time it
 * was begun, and a ring would be a thing the game's chance had to be kept clear of. Nothing of them is in the physics.
 */
import { type Mesh } from 'artshape-render/mesh/types';
import { FastMeshBuilder as MeshBuilder } from './fastmesh';
import { TILE, WATER_LEVEL, heightAt, slopeAt, tileAt, type Layout } from './arena';
import { WATER, oceanPattern } from './models/obstacles';
import { ROUGH } from './models/palette';
import { EARTH_BANDS, EARTH_SHELF, themeOf } from './theme';
import { matte, type Part } from './models/part';
import { BANK_STONE } from './models/lowpoly';
import { hashed, seeded } from './random';
import { ZONES, blur, distanceGrid, type Box, type Scratch } from './zones';

/** How much deeper than the water's own level a crater's pit is, in yards: far enough for a ball to be seen to fall into it. */
export const CRATER = {
  drop: 2.6,
  /** How high the crest of the lip stands over the ground, how far in from the curve the bowl takes to reach its floor, and how far out of the curve (in a tile that sticks out past it) the ground rises to the crest. */
  rim: 0.5,
  bowl: 3.2,
  lip: 1.5,
  /** Where each band begins, in yards in from the curve: the bowl is slow where earth's water is a step. */
  edges: [0, 0.8, 1.6, 2.4, 3.2],
} as const;

const smoothstep = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * How high a crater stands at a point `v` yards in from the curve its water is drawn by, over ground `top` high: the ground out
 * past the lip, a crest over it that the ground rises to over `lip` yards, and in from the crest a bowl falling smoothly to a
 * floor `drop` under the water's own level over `bowl` yards. Smooth all the way (no step, no wall): its slope at the crest and at
 * the floor is nought, and at the steepest the bowl's own is about 1.4.
 */
export function craterHeight(v: number, top: number): number {
  if (v <= 0) return top + CRATER.rim * smoothstep(1 + v / CRATER.lip);
  const floor = top + WATER_LEVEL - CRATER.drop;
  return top + CRATER.rim - (top + CRATER.rim - floor) * smoothstep(v / CRATER.bowl);
}

/** The slope of `craterHeight` with the depth, in height over yards. */
function craterSlope(v: number, top: number): number {
  const h = 1e-3;
  return (craterHeight(v + h, top) - craterHeight(v - h, top)) / (2 * h);
}

/** The shelf: how far above the water a water tile outside the curve stands, in the rock's warm brown. */
export const SHELF = { rise: 0.18, colour: EARTH_SHELF } as const;

/**
 * The ring of stones. A stone's radius is drawn from `least` to `most` for a kind of course (a yard on golf, where the ball
 * goes two hundred and the pond is seen from far back; a few tenths on minigolf) and, in the passes after the first, a
 * share of that (`passes`), to fill the gaps the big ones leave; the smallest is `smallest` of the least. It is squashed to
 * `squash` of its width in height. `kinds` is the colours. `ceiling` is the most triangles a hole's ring may have, measured on
 * 9 October 2026 on every hole of every course (the biggest was 14,048, on The Isles' Long Water, 439 stones of 32), with a tenth of room.
 */
export const STONE_RING = {
  golf: { least: 0.8, most: 1.25 },
  minigolf: { least: 0.45, most: 0.65 },
  passes: [1, 0.6, 0.4],
  smallest: 0.4,
  squash: 0.6,
  kinds: 3,
  ceiling: 15500,
  /** And the most the water's own bands and shelf may have a hole: 25,736 on the same hole at four pieces a tile, with a tenth of room. */
  waterCeiling: 28300,
} as const;

/**
 * How far apart two stones' middles may be, as a share of the sum of their radii, and still be touching: the packing lets
 * them overlap by a quarter and stops at their sides, and a lump is a little less than its radius, so a stone with no
 * neighbour within this is dropped, and the ring is a chain and not a scatter.
 */
export const TOUCH = 1.15;

/** One stone of the ring: where its middle is, how big, and what it is lit as. */
export interface Spot {
  x: number;
  y: number;
  /** The height of its middle; its top is `height` above it. */
  z: number;
  /** Its radius across, and its height from its middle to its top. */
  r: number;
  height: number;
  /** Where its top stands, and where the bank beside it does. */
  top: number;
  bank: number;
  /** Which of the colours it is, and the way it is turned. */
  kind: number;
  yaw: number;
  /** How much narrower than `r` it is along its other axis. */
  narrow: number;
}

export interface Pond {
  /** The shelf and the bands of water, as parts of a model, in the order they are drawn; none on a hole with no water. */
  parts: Part[];
  /** The stones of the ring. */
  spots: Spot[];
}

/** The water's drawn edge: how far in from it a point is, in yards, negative outside. */
export interface WaterEdge {
  depth(x: number, y: number): number;
  /** The level of the blurred water the curve is drawn at. */
  level: number;
}

/** The blur of the water's tile indicator, in tiles. */
const SIGMA = 1.2;
/**
 * Quicksilver's, in tiles: a lake with a kerb is drawn by its curve alone and must lie over the water's own tiles, and at 1.2 the
 * curve strayed up to three yards onto the ground beside them at a corner of the shore, where the ground's square bank wall stood
 * in view as a step; at a half it strays no more than three quarters of a yard, and the corners are still round.
 */
const SIGMA_QUICKSILVER = 0.5;
/** The level the curve is drawn at, at most, and the least it is lowered to. */
const LEVEL = { most: 0.45, least: 0.25, margin: 0.9 };
/** Where each band begins, in yards in from the edge: foam, two bands of shallows, the mid water, then deep. */
const EDGES = [0, WATER.foam, WATER.foam + 0.34, WATER.foam + 0.68, WATER.foam + 1.02];
/** How many pieces to a tile side a tile of water that the curve crosses is cut in: four, as the distance grid is, since six looked the same from every view tried and cost seven milliseconds and 12,000 triangles more on The Isles' Long Water. */
const PIECES = 4;
/** How far from the curve the distance is worked out, in yards: the widest the ring reaches and a little more. */
const REACH = 6;

/** The colours of the bands on earth, from the foam in (a biome's are its theme's). */
export const BAND_COLOURS = EARTH_BANDS;
const BAND_NAMES = ['foam', 'shallows', 'shallows 2', 'mid'];

/**
 * How high the ground stands at (x, y), a point at the water's side or past it: the height of the nearest ground (not water, not
 * rock) found in a ring of rings round it, carried back to the point by that ground's own slope, so it is what the point would stand
 * at were it ground and not the pit's floor. Looking every way for the nearest and not along a direction, which is the water's
 * depth's gradient and has none well out past its curve, so no tile of the shelf reads another reach's ground and sticks up as a
 * step. `fallback` where none is met.
 */
export function groundBeside(l: Layout, x: number, y: number, fallback: number) {
  for (const reach of [0.6, 1.2, 2, 3, 4.5, 6]) {
    let best: { qx: number; qy: number } | null = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const qx = x + Math.cos(a) * reach,
        qy = y + Math.sin(a) * reach;
      const t = tileAt(l, qx, qy);
      if (t < 0 || l.water[t] || l.solid[t]) continue;
      if (!best) best = { qx, qy };
    }
    if (best) {
      const [sx, sy] = slopeAt(l, best.qx, best.qy);
      return heightAt(l, best.qx, best.qy) - sx * (best.qx - x) - sy * (best.qy - y);
    }
  }
  return fallback;
}

/** The water's curve: the 0.45 level set of its blurred tiles, lowered where a channel would vanish; null on a hole with no water. */
export function waterEdgeOf(l: Layout): WaterEdge | null {
  return edgeOf(l)?.edge ?? null;
}

function edgeOf(
  l: Layout,
): { edge: WaterEdge; d: Float32Array; nx: number; ny: number; step: number; curve: Float32Array } | null {
  const { cols, rows } = l;
  const n = cols * rows;
  const box: Box = { x0: cols, y0: rows, x1: -1, y1: -1 };
  for (let t = 0; t < n; t++)
    if (l.water[t]) {
      const x = t % cols,
        y = (t - x) / cols;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
    }
  if (box.x1 < 0) return null;
  // the blur counts a tile of rock or rail for nothing, so the water runs on to a wall and does not shrink from it
  const value = new Float32Array(n),
    weight = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    value[t] = l.water[t] ? 1 : 0;
    weight[t] = l.solid[t] && !l.water[t] ? 0 : 1;
  }
  const sigma = themeOf(l).water.quicksilver ? SIGMA_QUICKSILVER : SIGMA;
  const r = Math.ceil(sigma * 3);
  box.x0 = Math.max(0, box.x0 - r);
  box.y0 = Math.max(0, box.y0 - r);
  box.x1 = Math.min(cols - 1, box.x1 + r);
  box.y1 = Math.min(rows - 1, box.y1 + r);
  const scratch: Scratch = { a: new Float32Array(n), w: new Float32Array(n), tb: new Float32Array(n) };
  blur(value, weight, cols, rows, sigma, box, scratch);
  // a half where every water tile's middle is above it, lower where a channel is thin, or it would be drawn away
  let low = 1;
  for (let t = 0; t < n; t++) if (l.water[t]) low = Math.min(low, scratch.tb[t]);
  const level = Math.max(LEVEL.least, Math.min(LEVEL.most, low * LEVEL.margin));
  const { d, segs } = distanceGrid(scratch.tb, cols, rows, box, ZONES.per, REACH, level);
  // the curve itself, as segments of four numbers in the world's yards, for what is laid along it (a crater's rim)
  const curve = segs.data.slice(0, segs.n);
  for (let i = 0; i < curve.length; i++) curve[i] += i % 2 === 0 ? l.originX : l.originY;
  const step = TILE / ZONES.per,
    nx = cols * ZONES.per + 1,
    ny = rows * ZONES.per + 1;
  const edge: WaterEdge = {
    level,
    depth(x, y) {
      const u = Math.min(nx - 1.001, Math.max(0, (x - l.originX) / step)),
        v = Math.min(ny - 1.001, Math.max(0, (y - l.originY) / step));
      const i = Math.floor(u),
        j = Math.floor(v),
        fu = u - i,
        fv = v - j;
      // the grid is signed with the inside negative; a depth is the other way
      return -(
        (d[j * nx + i] * (1 - fu) + d[j * nx + i + 1] * fu) * (1 - fv) +
        (d[(j + 1) * nx + i] * (1 - fu) + d[(j + 1) * nx + i + 1] * fu) * fv
      );
    },
  };
  return { edge, d, nx, ny, step, curve };
}

/** The curve a hole's water is drawn by, as segments of four numbers (x0, y0, x1, y1) in the world's yards; none on a hole with no water. */
export function waterCurveOf(l: Layout): Float32Array {
  return edgeOf(l)?.curve ?? new Float32Array(0);
}

interface Vx {
  x: number;
  y: number;
  v: number;
}

/** A convex polygon cut at `v = at` into the part below it and the part at or above. */
function cut(poly: Vx[], at: number): [Vx[], Vx[]] {
  const lo: Vx[] = [],
    hi: Vx[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    (a.v < at ? lo : hi).push(a);
    if (a.v < at !== b.v < at) {
      const u = (at - a.v) / (b.v - a.v);
      const m = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, v: at };
      lo.push(m);
      hi.push(m);
    }
  }
  return [lo, hi];
}

const CACHE = new WeakMap<Layout, Pond>();

/** A number from the water of a map, the same every time: where the ring starts its chance from. */
function mapSeed(l: Layout): number {
  let h = Math.imul(l.cols, 73856093) ^ Math.imul(l.rows, 19349663);
  for (let t = 0; t < l.water.length; t++) {
    h = Math.imul(h ^ (l.water[t] | (l.solid[t] << 1)), 0x01000193);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * The drawn pond of a hole: its water in bands, and its ring of stones. Made once for a layout and let go with it.
 */
export function pondOf(l: Layout): Pond {
  const hit = CACHE.get(l);
  if (hit) return hit;
  const out = build(l);
  CACHE.set(l, out);
  return out;
}

function build(l: Layout): Pond {
  const found = edgeOf(l);
  if (!found) return { parts: [], spots: [] };
  const { edge, d, nx } = found;
  const { cols, rows } = l;
  const kind = l.golf ? STONE_RING.golf : STONE_RING.minigolf;
  const shelf = new MeshBuilder();
  const crater = themeOf(l).water.crater;
  // a crater's bands are wider than earth's, since it is a bowl and not a step
  const quicksilver = themeOf(l).water.quicksilver;
  const edges: readonly number[] = crater ? CRATER.edges : EDGES;
  // quicksilver is one sheet at the water's level, and not a band of foam, shallows and deep: every band is one mesh
  const one = new MeshBuilder();
  const bands = edges.map(() => (quicksilver ? one : new MeshBuilder()));
  const zShelf = WATER_LEVEL + SHELF.rise;
  const ground = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && !l.water[ty * cols + tx] && !l.solid[ty * cols + tx];
  /** The height of the first ground met going out from (x, y), away from the water along (-gx, -gy), `v` yards of it being the way to the curve: the pit's floor is not the ground. */
  const groundBeyond = (x: number, y: number, gx: number, gy: number, v: number) => {
    for (const reach of [1.2, 2.4, 3.6, 4.8, 6]) {
      const qx = x - gx * (v + reach),
        qy = y - gy * (v + reach);
      const t = tileAt(l, qx, qy);
      if (t >= 0 && !l.water[t] && !l.solid[t]) return heightAt(l, qx, qy);
    }
    return meanTop;
  };
  const emit = (b: MeshBuilder, z: number, poly: readonly Vx[]) => {
    if (poly.length < 3) return;
    const ids = poly.map((p) => {
      // a quicksilver's shelf (the water's tiles outside its curve) lies on the level of the ground beside it, read where it is, and its
      // sheet at the water's level: so no tile sticks out as a step past the curve
      if (quicksilver && b === shelf) {
        return b.vertex(
          p.x - l.originX,
          p.y - l.originY,
          groundBeside(l, p.x, p.y, meanTop),
          0,
          0,
          1,
          (p.x - l.originX) / TILE,
          (p.y - l.originY) / TILE,
        );
      }
      if (!crater)
        return b.vertex(
          p.x - l.originX,
          p.y - l.originY,
          z,
          0,
          0,
          1,
          (p.x - l.originX) / TILE,
          (p.y - l.originY) / TILE,
        );
      // a crater is a bowl whose height is the depth's alone and whose face leans down the way the depth grows
      const e = 0.3;
      let gx = edge.depth(p.x + e, p.y) - edge.depth(p.x - e, p.y),
        gy = edge.depth(p.x, p.y + e) - edge.depth(p.x, p.y - e);
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      // the ground the lip stands on, read where it is: just out past the curve, away from the water, and not from the tile's neighbour
      // (the gradient of depth is only the curve's near it, so from the middle of the bowl in the ground's mean is used, blended in)
      // (the first ground met going out from the point, a tile of ground and not a tile of water, whose floor is the pit's)
      const near = groundBeyond(p.x, p.y, gx, gy, Math.max(p.v, 0));
      const deepen = smoothstep((p.v - CRATER.bowl * 0.3) / (CRATER.bowl * 0.5));
      const top = p.v <= 0 ? near : near + (meanTop - near) * deepen;
      const slope = craterSlope(p.v, top);
      const k = 1 / Math.hypot(slope, 1);
      return b.vertex(
        p.x - l.originX,
        p.y - l.originY,
        craterHeight(p.v, top),
        slope * gx * k,
        slope * gy * k,
        k,
        (p.x - l.originX) / TILE,
        (p.y - l.originY) / TILE,
      );
    });
    for (let i = 1; i + 1 < poly.length; i++) {
      // a cut along a tile's side leaves slivers with no area, which draw nothing and would only be counted
      const area =
        (poly[i].x - poly[0].x) * (poly[i + 1].y - poly[0].y) - (poly[i + 1].x - poly[0].x) * (poly[i].y - poly[0].y);
      if (Math.abs(area) > 1e-9) b.triangle(ids[0], ids[i], ids[i + 1]);
    }
  };

  // the ground a crater lies in, on the whole: what its floor is measured from, since a floor is flat
  let meanTop = 0;
  if (crater || quicksilver) {
    let sum = 0,
      count = 0;
    for (let t = 0; t < cols * rows; t++) {
      if (!l.water[t]) continue;
      const tx = t % cols,
        ty = (t - tx) / cols;
      for (const [ox, oy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ])
        if (ground(tx + ox, ty + oy)) {
          sum += heightAt(l, l.originX + (tx + ox + 0.5) * TILE, l.originY + (ty + oy + 0.5) * TILE);
          count++;
        }
    }
    meanTop = count ? sum / count : 0;
  }

  // the stones' candidates, kept as numbers in flat lists: a lake has tens of thousands
  const random = seeded(mapSeed(l));
  const cx: number[] = [],
    cy: number[] = [],
    cd: number[] = [],
    cs: number[] = [],
    cz: number[] = [];
  const pitch = kind.least * 0.4;
  const along = Math.ceil(TILE / pitch),
    gap = TILE / along;
  const widest = 2 * kind.most;

  const per = PIECES;
  const deep = edges[edges.length - 1];
  const at = (x: number, y: number, v: number): Vx => ({ x, y, v });
  for (let t = 0; t < cols * rows; t++) {
    const tx = t % cols,
      ty = (t - tx) / cols;
    if (!l.water[t]) continue;
    const x0 = l.originX + tx * TILE,
      y0 = l.originY + ty * TILE;
    const gS = ground(tx, ty - 1),
      gE = ground(tx + 1, ty),
      gN = ground(tx, ty + 1),
      gW = ground(tx - 1, ty);
    const sd = (x: number, y: number) => {
      let m = 99;
      if (gS) m = Math.min(m, y - y0);
      if (gE) m = Math.min(m, x0 + TILE - x);
      if (gN) m = Math.min(m, y0 + TILE - y);
      if (gW) m = Math.min(m, x - x0);
      return m;
    };
    // the height of the bank beside this tile, if any ground touches it even at a corner
    let bankZ: number | null = null;
    for (let dy = -1; dy <= 1 && bankZ === null; dy++)
      for (let dx = -1; dx <= 1 && bankZ === null; dx++)
        if (ground(tx + dx, ty + dy))
          bankZ = heightAt(l, l.originX + (tx + dx + 0.5) * TILE, l.originY + (ty + dy + 0.5) * TILE);

    // a tile the curve does not cross is one piece: the grid's own samples over it are all deep, or all outside the curve
    let lowest = Infinity,
      highest = -Infinity;
    const gi = tx * ZONES.per,
      gj = ty * ZONES.per;
    for (let j = 0; j <= ZONES.per; j++)
      for (let i = 0; i <= ZONES.per; i++) {
        const dv = -d[(gj + j) * nx + gi + i];
        if (dv < lowest) lowest = dv;
        if (dv > highest) highest = dv;
      }
    const sides = gS || gE || gN || gW;
    if (!sides && lowest >= deep) {
      emit(bands[edges.length - 1], WATER_LEVEL, [
        at(x0, y0, deep),
        at(x0 + TILE, y0, deep),
        at(x0 + TILE, y0 + TILE, deep),
        at(x0, y0 + TILE, deep),
      ]);
    } else if (highest < 0) {
      const out = crater || quicksilver ? -CRATER.lip : -1;
      emit(shelf, zShelf, [
        at(x0, y0, out),
        at(x0 + TILE, y0, out),
        at(x0 + TILE, y0 + TILE, out),
        at(x0, y0 + TILE, out),
      ]);
    } else {
      // the depth is the curve's, or the tile's side where it meets ground, whichever is nearer
      const dd = (x: number, y: number) =>
        crater || quicksilver ? edge.depth(x, y) : Math.min(edge.depth(x, y), sd(x, y));
      const step = TILE / per;
      const rowv: Vx[][] = [];
      for (let j = 0; j <= per; j++) {
        const r: Vx[] = [];
        for (let i = 0; i <= per; i++) {
          const x = x0 + i * step,
            y = y0 + j * step;
          r.push(at(x, y, dd(x, y)));
        }
        rowv.push(r);
      }
      for (let j = 0; j < per; j++)
        for (let i = 0; i < per; i++) {
          const quad = [rowv[j][i], rowv[j][i + 1], rowv[j + 1][i + 1], rowv[j + 1][i]];
          for (const tri of [
            [quad[0], quad[1], quad[2]],
            [quad[0], quad[2], quad[3]],
          ]) {
            let rest: Vx[] = tri;
            for (let k = 0; k < edges.length; k++) {
              const [lo, hi] = cut(rest, edges[k]);
              // below the first edge is the shelf; below each later one is the band before it
              if (k === 0) emit(shelf, zShelf, lo);
              else emit(bands[k - 1], WATER_LEVEL, lo);
              rest = hi;
              if (rest.length < 3) break;
            }
            emit(bands[edges.length - 1], WATER_LEVEL, rest);
          }
        }
    }

    // candidates for the ring, on a jittered lattice, in the tiles that touch ground: those not further in than a stone's width
    if (bankZ === null) continue;
    for (let j = 0; j < along; j++)
      for (let i = 0; i < along; i++) {
        const x = x0 + (i + 0.5 + (random() - 0.5)) * gap,
          y = y0 + (j + 0.5 + (random() - 0.5)) * gap;
        const s = sd(x, y);
        const dp = Math.min(edge.depth(x, y), s);
        if (dp > widest || s < kind.least * STONE_RING.smallest * 0.3) continue;
        cx.push(x);
        cy.push(y);
        cd.push(dp);
        cs.push(s);
        cz.push(bankZ);
      }
  }

  // a crater's rim has a boulder here and there, a third of the ring and not a wall of them
  const packed = pack(cx, cy, cd, cs, cz, random, kind);
  // and none round a quicksilver, whose kerb is clean chrome
  const spots = quicksilver ? [] : crater ? packed.filter((_, i) => i % 3 === 0) : packed;

  // the water in the colours of the hole's biome: a layout has one, so the pond kept for it is right
  const water = themeOf(l).water;
  const w = (c: readonly number[]) => matte([c[0], c[1], c[2]], ROUGH.water);
  const parts: Part[] = [];
  if (shelf.vertexCount)
    parts.push({
      name: 'shelf',
      mesh: shelf.build(),
      material: matte(water.shelf as [number, number, number], quicksilver ? 0.12 : ROUGH.rock),
    });
  if (quicksilver) {
    // one sheet of quicksilver following the curve, dark polished liquid metal in the open water's own waves and glints
    if (one.vertexCount)
      parts.push({
        name: 'deep',
        mesh: one.build(),
        material: w(water.ocean.body),
        pattern: oceanPattern(l.golf ? water.ocean.scale : water.ocean.minigolfScale, water.ocean),
      });
    return { parts, spots };
  }
  bands.forEach((b, k) => {
    if (!b.vertexCount) return;
    const mesh: Mesh = b.build();
    if (k < water.bands.length) parts.push({ name: BAND_NAMES[k], mesh, material: w(water.bands[k]) });
    else
      parts.push({
        name: 'deep',
        mesh,
        material: w(water.ocean.body),
        // a crater's pit is matte near-black and has no waves or sky in it
        ...(crater
          ? {}
          : { pattern: oceanPattern(l.golf ? water.ocean.scale : water.ocean.minigolfScale, water.ocean) }),
      });
  });
  return { parts, spots };
}

/**
 * The stones, packed greedily: the candidates shuffled, and in three passes (the big stones, then smaller to fill what they
 * leave) each taken if it is not too near one already placed. A first row hugs the edge, on the shelf or a stone's radius in
 * from the curve; then a partial second row, a stone's width at most from the edge, only where it lies against the first.
 * Last, a stone that touches no other is dropped.
 */
function pack(
  cx: number[],
  cy: number[],
  cd: number[],
  cs: number[],
  cz: number[],
  random: () => number,
  kind: { least: number; most: number },
): Spot[] {
  const spots: Spot[] = [];
  const n = cx.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const cell = 3;
  const grid = new Map<number, Spot[]>();
  const keyOf = (gx: number, gy: number) => gx * 100003 + gy;
  const near = (x: number, y: number, r: number, factor: number) => {
    const gx = Math.floor(x / cell),
      gy = Math.floor(y / cell);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const o of grid.get(keyOf(gx + a, gy + b)) ?? [])
          if (Math.hypot(o.x - x, o.y - y) < (o.r + r) * factor) return true;
    return false;
  };
  const put = (c: number, r: number, row: number): Spot => {
    const top = cz[c] - 0.04 + random() * 0.22 + (row === 0 ? 0.02 : 0);
    const height = r * STONE_RING.squash * BANK_STONE.rise;
    const yaw = random() * Math.PI * 2;
    const spot: Spot = {
      x: cx[c],
      y: cy[c],
      z: top - height,
      r,
      height,
      top,
      bank: cz[c],
      kind: Math.floor(random() * STONE_RING.kinds),
      yaw,
      narrow: 0.85 + 0.15 * Math.sin(yaw * 3.1),
    };
    spots.push(spot);
    const k = keyOf(Math.floor(spot.x / cell), Math.floor(spot.y / cell));
    const list = grid.get(k);
    if (list) list.push(spot);
    else grid.set(k, [spot]);
    return spot;
  };
  // one tight row hugging the edge (or filling the shelf): stones touching, none out in the water
  for (const share of STONE_RING.passes) {
    for (let o = 0; o < n; o++) {
      const c = order[o];
      const r = (kind.least + random() * (kind.most - kind.least)) * share;
      const row = cd[c] < 0 ? 0 : 1;
      if (row === 1 && !(cd[c] >= 0.62 * r && cd[c] <= 1.1 * r)) continue;
      if (cs[c] < (row === 0 ? 0.3 : 0.8) * r) continue;
      if (near(cx[c], cy[c], r, share === 1 ? (row === 0 ? 0.75 : 0.8) : 0.98)) continue;
      put(c, r, row);
    }
  }
  // a partial second row, only where it lies against the first and no more than a stone's width from the edge
  const second = new Set<Spot>();
  const lyingAgainst = (x: number, y: number, r: number) => {
    const gx = Math.floor(x / cell),
      gy = Math.floor(y / cell);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const o of grid.get(keyOf(gx + a, gy + b)) ?? [])
          if (!second.has(o) && Math.hypot(o.x - x, o.y - y) < (o.r + r) * 1.02) return true;
    return false;
  };
  for (let c = 0; c < n; c++) {
    if (cd[c] < 0) continue;
    const r = (kind.least + random() * (kind.most - kind.least)) * 0.7;
    if (cd[c] < 1.5 * r || cd[c] > 2 * r || cs[c] < 0.8 * r) continue;
    if (hashed(Math.floor(cx[c] / 4), Math.floor(cy[c] / 4)) > 0.45) continue;
    if (!lyingAgainst(cx[c], cy[c], r) || near(cx[c], cy[c], r, 0.85)) continue;
    second.add(put(c, r, 2));
  }
  // none stands alone
  return spots.filter((s) => {
    const gx = Math.floor(s.x / cell),
      gy = Math.floor(s.y / cell);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const o of grid.get(keyOf(gx + a, gy + b)) ?? [])
          if (o !== s && Math.hypot(o.x - s.x, o.y - s.y) <= (o.r + s.r) * TOUCH) return true;
    return false;
  });
}
