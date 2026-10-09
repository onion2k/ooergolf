/**
 * The banks of a golf hole seen from the play camera: the rough and out of bounds coloured by how high the ground stands over
 * the nearest ground a ball is played from, and its bends shaded, so a bank reads as a bank from two hundred yards back and
 * not as a flat lawn with trees on it. Without it the land's slopes are lit by the toon bands alone, which at the play
 * camera's tilt differ by too little to see, and the rough that rises six yards beside a fairway looks as flat as the green.
 *
 * It is a field of numbers, one for the hole, from -1 (a valley or a bend's foot: darker and cooler) to 1 (a crest: lighter, and
 * warmer, toward a sunlit yellow-green), worked out from the layout alone so a test can read it without a page.
 *
 * How it is drawn. The renderer's vertices carry no colour, so a colour a vertex is given must be a mesh of its own: the ground
 * is divided into one mesh for each of `steps` steps of the field (`splitByTint`, in `tintmesh.ts`), each triangle into the step the field has at
 * its middle, and each mesh is painted its step's colour. The mock did the same into seven by the yard-square piece, and the
 * edge between two followed the grid of the ground as stairs, a jump of a seventh of the range at every one; into twenty-one
 * the jump between two is a twentieth of the ground's own light, below what the eye picks out on ground with grass on it, and the
 * stairs are as fine as the triangles (a yard). (The ground texture was tried first, as smooth as the field is, and cost a frame
 * 0.8 ms at the tee, since the renderer draws a textured group through its dearest build and the rough and out of bounds are most
 * of the screen. And the triangles cut along the line the field crosses a step at: the ground came out 3.7 times as many triangles
 * and 4 times the vertices, 0.3 ms a frame, for a picture within a few levels of this one, at a few pixels in a thousand.)
 * The blades of the rough follow the field in as many kinds of grass as a field may have (`kindOfLevel`), cut where the
 * field is half way between two of them. Minigolf has none: a hole of it is drawn as ever.
 */
import { TILE, heightAt, tileAt, type Layout } from './arena';
import { LIE } from './surfaces';

/**
 * The figures of the tint, chosen by the user on 9 October 2026 from a mock of three strengths ("medium", with creases): the
 * rough from about 30% darker and cooler at a valley to about 36% of the way toward a sunlit yellow-green on a crest, and the
 * bend's foot darkened and its crest lightened by a little over half as much again at most.
 */
export const BANK_TINT = {
  /** How far over the nearest ground a ball is played from, in yards, the ground is a full crest: the banks are 3 to 6 high, and swells under them. */
  over: 6,
  /** How much of the field the height gives, from the valley (nought over) to the crest (`over`): 0.6, so the tint alone reaches 0.6 on a crest. */
  tint: 0.6,
  /** How much of the field a bend gives, at most: 0.6, so a foot is darkened and a crest lightened by up to that much. */
  crease: 0.6,
  /** How far apart the ground is read to find a bend, in yards, and the bend (how much the ground's height differs from the mean of its four neighbours, per square yard) that is a whole crease. */
  reach: 1.5,
  curve: 0.05,
  /** What a full valley takes from each channel of a colour: red a half, green two fifths, blue a tenth, so it is darker and cooler. */
  valley: [0.5, 0.4, 0.1],
  /** Where a full crest of the rough goes: toward this linear colour, by this share; out of bounds goes by its own colour's gain instead, to be a dry pale grass still. */
  crest: { to: [0.4, 0.56, 0.02], share: 0.6 },
  oob: { gain: [1.3, 1.25, 1], share: 0.7 },
  /** How many meshes the ground is divided into, a colour each: odd, so one is the colour as it is. */
  steps: 21,
  /** How many steps each side of nought the blades are cut into: with the rough's own and the fairway's, the 8 kinds of grass a field may have. */
  levels: 3,
  /** How wide a cell of the field is, in yards: smaller than a tile, so a bank's foot and crest are two cells apart at the least. */
  cell: 2,
  /** How far in from the hole's edge the field is brought back to nought, in yards, so the ground meets the plain ground beyond the hole in one colour. */
  fade: 6,
} as const;

/** The field of a hole: a grid of numbers over the hole, and how to read it. */
export interface Tint {
  /** The field, row by row from the hole's south west corner: -1 to 1, a cell of `BANK_TINT.cell` yards. */
  field: Float32Array;
  cols: number;
  rows: number;
  /** The field at a point of the world: bilinear between the cells' middles, and nought off the hole. */
  at(x: number, y: number): number;
}

/**
 * The height of the nearest ground a ball is played from, for every tile: a flood from the play tiles (not rough, not out of
 * bounds, not rock or water), each tile taking its neighbour's. NaN where none can be reached, which a hole with a fairway is not.
 */
export function baseOf(l: Layout): Float32Array {
  const n = l.cols * l.rows;
  const base = new Float32Array(n).fill(NaN);
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let t = 0; t < n; t++) {
    const play = l.lie[t] !== LIE.rough && !l.oob[t] && !l.solid[t] && !l.water[t];
    if (!play) continue;
    base[t] = heightAt(l, l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE);
    queue[tail++] = t;
  }
  while (head < tail) {
    const t = queue[head++],
      x = t % l.cols,
      y = Math.floor(t / l.cols);
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0),
        ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
      const u = ny * l.cols + nx;
      if (!Number.isNaN(base[u])) continue;
      base[u] = base[t];
      queue[tail++] = u;
    }
  }
  return base;
}

const clamp = (v: number, least: number, most: number) => Math.max(least, Math.min(most, v));

/** The tint of a height `over` the nearest ground a ball is played from, alone: -`tint` at nought, `tint` at `BANK_TINT.over` and more, between by a straight line. */
export const riseTint = (over: number) => BANK_TINT.tint * (2 * clamp(over / BANK_TINT.over, 0, 1) - 1);

/** How much the ground at a point is bent, from -1 (the foot of a bank, concave) to 1 (its crest, convex): the mean of its four neighbours a `reach` off against its own height, over `curve`. */
export function bendAt(l: Layout, x: number, y: number): number {
  const e = BANK_TINT.reach;
  const lap =
    (heightAt(l, x + e, y) +
      heightAt(l, x - e, y) +
      heightAt(l, x, y + e) +
      heightAt(l, x, y - e) -
      4 * heightAt(l, x, y)) /
    (e * e);
  return clamp(-lap / BANK_TINT.curve, -1, 1);
}

/** The field at a point from what it is made of: how high it stands over the ground a ball is played from, and how it is bent there. */
export const fieldFrom = (over: number, bend: number) => clamp(riseTint(over) + BANK_TINT.crease * bend, -1, 1);

/**
 * `c` (linear, with its roughness after) at a field value `s`: from -1, darker and cooler by `valley`, through itself at
 * nought, to 1, `share` of the way toward the crest's yellow-green, or for out of bounds, toward its own colour brightened.
 */
export function tinted(c: readonly number[], s: number, oob = false): number[] {
  const out = [c[0], c[1], c[2], ...c.slice(3)];
  if (s < 0) {
    for (let i = 0; i < 3; i++) out[i] *= 1 - BANK_TINT.valley[i] * -s;
  } else if (s > 0) {
    const share = (oob ? BANK_TINT.oob.share : BANK_TINT.crest.share) * s;
    for (let i = 0; i < 3; i++) {
      const to = oob ? c[i] * BANK_TINT.oob.gain[i] : BANK_TINT.crest.to[i];
      out[i] = c[i] + (to - c[i]) * share;
    }
  }
  return out;
}

/** The step of the ground's meshes a field value is in, from nought to `steps` less one: the field's range cut in equal parts. */
export const stepOf = (s: number) => clamp(Math.floor(((s + 1) / 2) * BANK_TINT.steps), 0, BANK_TINT.steps - 1);

/** The field value the colour of step `k` of the ground's meshes is made at: the middle of its part of the range, nought for the middle step. */
export const valueOfStep = (k: number) => -1 + ((k + 0.5) * 2) / BANK_TINT.steps;

/** The step a field value is cut to for the blades, from -`levels` to `levels`. */
export const levelOf = (s: number) => Math.round(clamp(s, -1, 1) * BANK_TINT.levels);

/** The field value a blades' step stands for: the colour a kind of blade of that step is. */
export const valueOf = (level: number) => level / BANK_TINT.levels;

/** The kinds of grass the rough's steps are, past the rough's own (0) and the fairway's (1): the three darker and then the three lighter. Step nought is the rough itself. */
export const kindOfLevel = (level: number) => (level === 0 ? 0 : level < 0 ? 2 + level + BANK_TINT.levels : 4 + level);

/** The tints made, by layout, so a hole's is made once, and let go when its layout is. */
const made = new WeakMap<Layout, Tint | null>();

/**
 * The tint of a golf hole, made on first asking and kept with the layout: none for minigolf, which is not tinted. A cell is
 * read at its middle from the ground as it is, with the nearest play ground's height blurred a little so a step in it (the
 * tile its height was read at) does not show, and the whole brought back to nought toward the hole's edge.
 */
export function tintOf(l: Layout): Tint | null {
  if (!l.golf) return null;
  const kept = made.get(l);
  if (kept !== undefined) return kept;
  const cell = BANK_TINT.cell;
  const cols = Math.ceil((l.cols * TILE) / cell),
    rows = Math.ceil((l.rows * TILE) / cell);
  const n = cols * rows;
  const base = baseOf(l);
  const high = new Float32Array(n).fill(NaN),
    low = new Float32Array(n).fill(NaN),
    bend = new Float32Array(n);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = l.originX + (i + 0.5) * cell,
        y = l.originY + (j + 0.5) * cell;
      const t = tileAt(l, x, y);
      if (t < 0) continue;
      const k = j * cols + i;
      high[k] = heightAt(l, x, y);
      low[k] = base[t];
      bend[k] = bendAt(l, x, y);
    }
  const blurred = blur(low, cols, rows, 2);
  const field = new Float32Array(n);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (Number.isNaN(high[k])) continue;
      // a hole with nowhere to be played from has no valley to measure from: its ground is neither
      const floor = Number.isNaN(blurred[k]) ? high[k] - BANK_TINT.over / 2 : blurred[k];
      // the field comes back to nought at the hole's edge by a smooth step, so what is drawn there is the plain ground beyond it
      const edge = Math.min(i + 0.5, cols - i - 0.5, j + 0.5, rows - j - 0.5) * cell;
      const near = clamp(edge / BANK_TINT.fade, 0, 1);
      field[k] = fieldFrom(high[k] - floor, bend[k]) * near * near * (3 - 2 * near);
    }
  const at = (x: number, y: number) => {
    const u = (x - l.originX) / cell - 0.5,
      v = (y - l.originY) / cell - 0.5;
    const i0 = Math.floor(u),
      j0 = Math.floor(v);
    const fx = u - i0,
      fy = v - j0;
    // a cell off the grid is nought
    const cellAt = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : field[j * cols + i]);
    const a = cellAt(i0, j0),
      b = cellAt(i0 + 1, j0),
      c = cellAt(i0, j0 + 1),
      d = cellAt(i0 + 1, j0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const out: Tint = { field, cols, rows, at };
  made.set(l, out);
  return out;
}

/** `values` (a grid of `cols` by `rows`, NaN where there is nothing) averaged with its neighbours `passes` times, over the numbers that are there. */
function blur(values: Float32Array, cols: number, rows: number, passes: number): Float32Array {
  let from: Float32Array = values,
    to: Float32Array = new Float32Array(values.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        let sum = 0,
          count = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const x = i + di,
              y = j + dj;
            if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
            const v = from[y * cols + x];
            if (Number.isNaN(v)) continue;
            sum += v;
            count++;
          }
        to[j * cols + i] = count ? sum / count : NaN;
      }
    [from, to] = [to, from];
  }
  return from;
}
