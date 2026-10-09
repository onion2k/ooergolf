/**
 * The kinds of ground of a golf hole by distance and not by tile. Each of the fairway, green, tee, sand and out of
 * bounds is its tile indicator blurred (a normalised blur, so water, rock and the other kinds count for nothing at
 * their edge), its 0.5 level set is the curve, and the first cut round the fairway and the fringe round the green are
 * bands of constant width outside their curves. Drawn this way a hole has the round shapes of the title picture, and
 * because `at` is the one place that says what lies where, what is drawn is what is played.
 *
 * The signed distance to a curve is worked out only in a narrow band round it (the widest band and a tile), on a grid of
 * four pieces to a tile, and read as far, with its sign, anywhere else: a first version that worked it out for every
 * point of a finer grid took half a second on a long hole, and a hole may not begin that slowly. Without the band the
 * begin gate would fail on every golf hole; without the sign the far side of a curve would read as the near.
 */
import { TILE, type Layout } from './arena';
import { LIE } from './surfaces';

/** The fields, in the order the rules read them: negative inside the kind, in yards. */
export const FAIRWAY = 0,
  GREEN = 1,
  TEE = 2,
  SAND = 3,
  OUT = 4;
export const FIELDS = 5;

export const ZONES = {
  /** Gaussian blur, in tiles, by field; the tee's is smaller so its corners are only softened. */
  sigma: [1.5, 1.5, 0.7, 1.2, 1.5] as readonly number[],
  /** Pieces to a tile side: four keeps a curve smooth (the band-width test holds it), and an even number keeps the grid on the blur's tile middles. */
  per: 4,
  /** The first cut's width, in yards: a tile. */
  band: 3,
  /** The bunker's lip, in yards. */
  lip: 0.4,
  /**
   * How far from its curve a field's distance is worked out, in yards, by field: the widest rule on it and a tile more,
   * which also leaves a grid piece of room for the distance to be read between points. A function, since `TILE` is not
   * there yet when this module is read first, `arena.ts` and it each waiting for the other. Beyond it a field reads as `far`.
   */
  reach: (field: number): number => (field === FAIRWAY || field === GREEN ? ZONES.band + TILE : TILE),
  /** What a field reads where it is further from its curve than its reach, outside with a plus and inside a minus. */
  far: 99,
};

export type Zone = 'sand' | 'lip' | 'oob' | 'tee' | 'putting' | 'cut' | 'fairway' | 'rough';

/** The rules in priority order: the first whose field is below its threshold is the zone; where none is, rough. */
export const RULES: readonly [field: number, below: number, zone: Zone][] = [
  [SAND, -ZONES.lip, 'sand'],
  [SAND, 0, 'lip'],
  [OUT, 0, 'oob'],
  [TEE, 0, 'tee'],
  [GREEN, 0, 'putting'],
  [GREEN, ZONES.band, 'cut'],
  [FAIRWAY, 0, 'fairway'],
  [FAIRWAY, ZONES.band, 'cut'],
];

export interface Zones {
  /** Points of the grid a side. */
  nx: number;
  ny: number;
  per: number;
  /** Where the grid's first point is, and how far apart its points are, in yards. */
  ox: number;
  oy: number;
  step: number;
  /** The grid of each field's distance, `nx * ny` points row by row from the south; null where the hole has none of the kind. */
  d: (Float32Array | null)[];
  /** Each field's curve as segments of four numbers (x0, y0, x1, y1) in the world's yards, for the stakes and the shore to follow. */
  curves: Float32Array[];
  /** Every field's distance at a point, bilinear in the grid, written into `out`. */
  sample(x: number, y: number, out: Float32Array | number[]): void;
  /** The zone at a point. */
  at(x: number, y: number): Zone;
  /**
   * The zone of the whole of tile (tx, ty) when it is one zone from edge to edge, else null. Exact: the fields are bilinear
   * in the grid, so where every grid point of the tile is on the same side of every rule's threshold, every point is.
   * What lets a pass over a hole read a point only where a curve crosses.
   */
  tileZone(tx: number, ty: number): Zone | null;
}

const CACHE = new WeakMap<Layout, Zones>();

function kernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

/** The tiles a blur is worked out over: the kind's own, and as far round as the blur reaches. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Scratch the passes share, made once for a hole and let go with it. */
export interface Scratch {
  a: Float32Array;
  w: Float32Array;
  tb: Float32Array;
}

/**
 * Normalised blur of `vw` (value times weight) by `weight` over the tiles of `box`, separable, into `s.tb`: the same sum
 * as blurring the whole grid, since outside the box no tile of the kind is within the kernel's reach and the blur is nought.
 */
export function blur(
  vw: Float32Array,
  weight: Float32Array,
  cols: number,
  rows: number,
  sigma: number,
  box: Box,
  s: Scratch,
) {
  const k = kernel(sigma),
    r = (k.length - 1) / 2;
  const { a, w, tb } = s;
  const ya = Math.max(0, box.y0 - r),
    yb = Math.min(rows - 1, box.y1 + r);
  for (let y = ya; y <= yb; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      let sa = 0,
        sw = 0;
      const lo = Math.max(-r, -x),
        hi = Math.min(r, cols - 1 - x);
      for (let i = lo; i <= hi; i++) {
        const q = y * cols + x + i;
        sa += k[i + r] * vw[q];
        sw += k[i + r] * weight[q];
      }
      a[y * cols + x] = sa;
      w[y * cols + x] = sw;
    }
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      let sa = 0,
        sw = 0;
      const lo = Math.max(-r, -y),
        hi = Math.min(r, rows - 1 - y);
      for (let i = lo; i <= hi; i++) {
        const q = (y + i) * cols + x;
        sa += k[i + r] * a[q];
        sw += k[i + r] * w[q];
      }
      tb[y * cols + x] = sw > 1e-4 ? sa / sw : 0;
    }
}

/** A growing list of segments, four numbers each. */
class Segments {
  data = new Float32Array(4096);
  n = 0;
  add(x0: number, y0: number, x1: number, y1: number) {
    if (this.n + 4 > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data[this.n++] = x0;
    this.data[this.n++] = y0;
    this.data[this.n++] = x1;
    this.data[this.n++] = y1;
  }
}

const LEVEL = 0.5;

/**
 * The curve of one field and its signed distance grid. `tb` is the field's blurred tiles; the grid's point (i, j) is at
 * (i, j) steps from the origin and reads `tb` bilinearly between tile middles, as a point's value is anywhere.
 */
export function distanceGrid(
  tb: Float32Array,
  cols: number,
  rows: number,
  box: Box,
  per: number,
  reach: number,
  level = LEVEL,
): { d: Float32Array; segs: Segments } {
  const step = TILE / per,
    half = per / 2;
  const nx = cols * per + 1,
    ny = rows * per + 1;
  const far = ZONES.far;
  // the blurred value at grid point (i, j), the mock's: bilinear between tile middles, held at the outermost
  const value = (i: number, j: number) => {
    const v = Math.min(rows - 1, Math.max(0, j / per - 0.5)),
      u = Math.min(cols - 1, Math.max(0, i / per - 0.5));
    const j0 = Math.floor(v),
      i0 = Math.floor(u),
      j1 = Math.min(rows - 1, j0 + 1),
      i1 = Math.min(cols - 1, i0 + 1),
      fu = u - i0,
      fv = v - j0;
    return (
      (tb[j0 * cols + i0] * (1 - fu) + tb[j0 * cols + i1] * fu) * (1 - fv) +
      (tb[j1 * cols + i0] * (1 - fu) + tb[j1 * cols + i1] * fu) * fv
    );
  };

  // far from every curve a point reads as far, with the sign of the tile it is in
  const d = new Float32Array(nx * ny).fill(far);
  for (let ty = box.y0; ty <= box.y1; ty++)
    for (let tx = box.x0; tx <= box.x1; tx++) {
      if (!(tb[ty * cols + tx] > level)) continue;
      const jEnd = ty === rows - 1 ? ny : (ty + 1) * per,
        iEnd = tx === cols - 1 ? nx : (tx + 1) * per;
      for (let j = ty * per; j < jEnd; j++) d.fill(-far, j * nx + tx * per, j * nx + iEnd);
    }

  // marching squares on the grid, only in the cells between tile middles that a half passes through
  const segs = new Segments();
  const f = new Float64Array((per + 1) * (per + 1));
  const px = new Float64Array(4),
    py = new Float64Array(4),
    has = new Uint8Array(4);
  const stride = per + 1;
  const cell = (i: number, j: number, ci: number, cj: number) => {
    const f00 = f[cj * stride + ci],
      f10 = f[cj * stride + ci + 1],
      f11 = f[(cj + 1) * stride + ci + 1],
      f01 = f[(cj + 1) * stride + ci];
    const pos = (f00 > 0 ? 1 : 0) | (f10 > 0 ? 2 : 0) | (f11 > 0 ? 4 : 0) | (f01 > 0 ? 8 : 0);
    if (pos === 0 || pos === 15) return;
    const x0 = i * step,
      y0 = j * step;
    has.fill(0);
    let count = 0;
    // crossings on the bottom, right, top and left edges
    if (f00 > 0 !== f10 > 0) {
      has[0] = 1;
      px[0] = x0 + (f00 / (f00 - f10)) * step;
      py[0] = y0;
      count++;
    }
    if (f10 > 0 !== f11 > 0) {
      has[1] = 1;
      px[1] = x0 + step;
      py[1] = y0 + (f10 / (f10 - f11)) * step;
      count++;
    }
    if (f01 > 0 !== f11 > 0) {
      has[2] = 1;
      px[2] = x0 + (f01 / (f01 - f11)) * step;
      py[2] = y0 + step;
      count++;
    }
    if (f00 > 0 !== f01 > 0) {
      has[3] = 1;
      px[3] = x0;
      py[3] = y0 + (f00 / (f00 - f01)) * step;
      count++;
    }
    const seg = (p: number, q: number) => segs.add(px[p], py[p], px[q], py[q]);
    if (count === 2) {
      let p = 0;
      while (!has[p]) p++;
      let q = p + 1;
      while (!has[q]) q++;
      seg(p, q);
    } else if (count === 4) {
      if ((f00 + f10 + f11 + f01) / 4 > 0 === f00 > 0) {
        seg(0, 1);
        seg(2, 3);
      } else {
        seg(0, 3);
        seg(1, 2);
      }
    }
  };
  for (let b = Math.max(0, box.y0 - 1); b <= Math.min(rows - 2, box.y1); b++)
    for (let a = Math.max(0, box.x0 - 1); a <= Math.min(cols - 2, box.x1); a++) {
      const q = b * cols + a;
      const c0 = tb[q] > level,
        c1 = tb[q + 1] > level,
        c2 = tb[q + cols] > level,
        c3 = tb[q + cols + 1] > level;
      if (c0 === c1 && c1 === c2 && c2 === c3) continue;
      // the grid points from this cell's lower corner (a tile middle) to its upper
      const i0 = a * per + half,
        j0 = b * per + half;
      for (let cj = 0; cj <= per; cj++)
        for (let ci = 0; ci <= per; ci++) f[cj * stride + ci] = value(i0 + ci, j0 + cj) - level;
      for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++) cell(i0 + ci, j0 + cj, ci, cj);
    }

  // the exact distance to the nearest segment, for each point within reach of one, by visiting only the points round each: for
  // each row, the stretch of it that is within reach of the segment's own extent, since a point outside it cannot be nearer
  // than the reach and would not be written. The sign is put on afterwards, once for each point written, since it is the
  // blurred field's at the point whichever segment was nearest.
  const data = segs.data;
  const r2 = reach * reach;
  let wLo = nx,
    wHi = -1,
    vLo = ny,
    vHi = -1;
  for (let s = 0; s < segs.n; s += 4) {
    const ax = data[s],
      ay = data[s + 1],
      bx = data[s + 2],
      by = data[s + 3];
    const vx = bx - ax,
      vy = by - ay;
    const l2 = vx * vx + vy * vy;
    const xMin = Math.min(ax, bx),
      xMax = Math.max(ax, bx),
      yMin = Math.min(ay, by),
      yMax = Math.max(ay, by);
    const jLo = Math.max(0, Math.floor((yMin - reach) / step)),
      jHi = Math.min(ny - 1, Math.ceil((yMax + reach) / step));
    if (jLo < vLo) vLo = jLo;
    if (jHi > vHi) vHi = jHi;
    for (let j = jLo; j <= jHi; j++) {
      const py0 = j * step;
      const gap = py0 < yMin ? yMin - py0 : py0 > yMax ? py0 - yMax : 0;
      const left = r2 - gap * gap;
      if (left <= 0) continue;
      const across = Math.sqrt(left);
      const iLo = Math.max(0, Math.floor((xMin - across) / step) - 1),
        iHi = Math.min(nx - 1, Math.ceil((xMax + across) / step) + 1);
      if (iLo < wLo) wLo = iLo;
      if (iHi > wHi) wHi = iHi;
      for (let i = iLo; i <= iHi; i++) {
        const x = i * step;
        let u = l2 > 0 ? ((x - ax) * vx + (py0 - ay) * vy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = ax + u * vx - x,
          ey = ay + u * vy - py0;
        const e2 = ex * ex + ey * ey;
        const at = j * nx + i;
        const held = d[at];
        // the nearest so far, and never past the reach: a point is either near a curve or far
        const best = Math.abs(held) < reach ? held * held : r2;
        if (e2 < best) d[at] = Math.sqrt(e2);
      }
    }
  }
  for (let j = vLo; j <= vHi; j++)
    for (let i = wLo; i <= wHi; i++) {
      const at = j * nx + i;
      const near = Math.abs(d[at]);
      // (a point written has less than `far`, even if rounding to a float made its distance the reach itself)
      if (near < far) d[at] = (value(i, j) > level ? -1 : 1) * near;
    }
  return { d, segs };
}

export function zonesOf(l: Layout): Zones {
  const hit = CACHE.get(l);
  if (hit) return hit;
  if (!l.golf) throw new Error('zonesOf is for a hole of golf: a hole of minigolf keeps its tiles and its rails');
  const { cols, rows } = l;
  const n = cols * rows;
  const per = ZONES.per,
    step = TILE / per;
  const nx = cols * per + 1,
    ny = rows * per + 1;
  const cupTile = Math.floor((l.cup.y - l.originY) / TILE) * cols + Math.floor((l.cup.x - l.originX) / TILE);
  // each field: what a tile is worth (1 inside the kind) and whether it counts at all (a tile of another sort of ground does not
  // push the kind's edge in: the fairway runs on to the water, and under a bunker)
  const vw: Float32Array[] = [],
    weight: Float32Array[] = [];
  for (let k = 0; k < FIELDS; k++) {
    vw.push(new Float32Array(n));
    weight.push(new Float32Array(n));
  }
  for (let t = 0; t < n; t++) {
    const lie = l.lie[t];
    const sand = l.sand[t] === 1 && !l.water[t] && !l.solid[t];
    const ground = !l.solid[t] && !l.water[t];
    const oob = l.oob[t] === 1;
    // fairway: counts on every tile of ground that is not sand, green, tee or out of bounds
    const wf = ground && !sand && !oob && lie !== LIE.green && lie !== LIE.tee && t !== cupTile ? 1 : 0;
    weight[FAIRWAY][t] = wf;
    vw[FAIRWAY][t] = lie === LIE.fairway ? wf : 0;
    const wg = ground && !sand && !oob ? 1 : 0;
    weight[GREEN][t] = wg;
    vw[GREEN][t] = lie === LIE.green || t === cupTile ? wg : 0;
    const wt = ground && !oob ? 1 : 0;
    weight[TEE][t] = wt;
    vw[TEE][t] = lie === LIE.tee ? wt : 0;
    weight[SAND][t] = ground ? 1 : 0;
    vw[SAND][t] = sand ? 1 : 0;
    const wo = l.solid[t] || l.water[t] ? 0 : 1;
    weight[OUT][t] = wo;
    vw[OUT][t] = oob ? wo : 0;
  }

  const scratch: Scratch = { a: new Float32Array(n), w: new Float32Array(n), tb: new Float32Array(n) };
  const d: (Float32Array | null)[] = [],
    curves: Float32Array[] = [];
  const ox = l.originX,
    oy = l.originY;
  for (let k = 0; k < FIELDS; k++) {
    // the tiles of the kind and the tiles its blur reaches
    const r = Math.max(1, Math.ceil(ZONES.sigma[k] * 3));
    const box: Box = { x0: cols, y0: rows, x1: -1, y1: -1 };
    for (let t = 0; t < n; t++)
      if (vw[k][t] > 0) {
        const x = t % cols,
          y = (t - x) / cols;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
    if (box.x1 < 0) {
      d.push(null);
      curves.push(new Float32Array(0));
      continue;
    }
    box.x0 = Math.max(0, box.x0 - r);
    box.y0 = Math.max(0, box.y0 - r);
    box.x1 = Math.min(cols - 1, box.x1 + r);
    box.y1 = Math.min(rows - 1, box.y1 + r);
    scratch.tb.fill(0);
    blur(vw[k], weight[k], cols, rows, ZONES.sigma[k], box, scratch);
    const grid = distanceGrid(scratch.tb, cols, rows, box, per, ZONES.reach(k));
    d.push(grid.d);
    const world = grid.segs.data.slice(0, grid.segs.n);
    for (let i = 0; i < world.length; i++) world[i] += i % 2 === 0 ? ox : oy;
    curves.push(world);
  }

  const zones: Zones = {
    nx,
    ny,
    per,
    ox,
    oy,
    step,
    d,
    curves,
    sample(x, y, out) {
      const u = Math.min(nx - 1.001, Math.max(0, (x - ox) / step)),
        v = Math.min(ny - 1.001, Math.max(0, (y - oy) / step));
      const i = Math.floor(u),
        j = Math.floor(v),
        fu = u - i,
        fv = v - j;
      for (let k = 0; k < FIELDS; k++) {
        const a = d[k];
        out[k] =
          a === null
            ? ZONES.far
            : (a[j * nx + i] * (1 - fu) + a[j * nx + i + 1] * fu) * (1 - fv) +
              (a[(j + 1) * nx + i] * (1 - fu) + a[(j + 1) * nx + i + 1] * fu) * fv;
      }
    },
    at(x, y) {
      zones.sample(x, y, SCRATCH);
      return classify(SCRATCH);
    },
    tileZone: (tx, ty) => uniform(tx * per, ty * per, per, per),
  };
  /**
   * Which rules a grid point is below the threshold of, a bit each, worked out the first time it is asked for and kept: a
   * point is a corner of up to four tiles, and a pass over the hole asks each tile for all twenty-five of its own.
   */
  const masks = new Uint16Array(nx * ny).fill(UNKNOWN);
  const fields = RULES.map(([k]) => d[k]);
  const maskAt = (q: number) => {
    let m = masks[q];
    if (m !== UNKNOWN) return m;
    m = 0;
    for (let r = 0; r < RULES.length; r++) {
      const a = fields[r];
      if ((a === null ? ZONES.far : a[q]) < RULES[r][1]) m |= 1 << r;
    }
    return (masks[q] = m);
  };
  const uniform = (i0: number, j0: number, w: number, h: number): Zone | null => {
    const first = maskAt(j0 * nx + i0);
    for (let j = j0; j <= j0 + h; j++) for (let i = i0; i <= i0 + w; i++) if (maskAt(j * nx + i) !== first) return null;
    for (let r = 0; r < RULES.length; r++) if (first & (1 << r)) return RULES[r][2];
    return 'rough';
  };
  CACHE.set(l, zones);
  return zones;
}

const SCRATCH = new Float32Array(FIELDS);

/** A mask not yet worked out: more bits than there are rules. */
const UNKNOWN = 0xffff;

/** The zone a set of field values makes, by the rules. */
export function classify(v: ArrayLike<number>): Zone {
  for (let r = 0; r < RULES.length; r++) {
    const rule = RULES[r];
    if (v[rule[0]] < rule[1]) return rule[2];
  }
  return 'rough';
}
