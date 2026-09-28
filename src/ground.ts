/**
 * The ground of a hole as it is drawn: one mesh over its grass that follows
 * the ground's slopes, in the two colours of its mown stripes, and the earth
 * wherever the ground steps down to what is beside it. Each tile of grass
 * is cut into a few pieces a side, every corner at the tile's own step and
 * the terrain smoothed there, with normals from the terrain's slope, so a
 * hill shades as one surface. Where the ground is flat it is the flat tiles
 * it replaced. Built from the layout alone, headless: the scene places it.
 *
 * Without it the green was a square a tile laid flat at each tile's step,
 * which cannot follow a slope, with boxes of earth under the raised ones.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { TILE, slopeAt, stepAt, terrainAt, tileAt, type Layout } from './arena';
import { face, tri } from './meshes';

type V3 = [number, number, number];

/** How many pieces each tile of grass is cut into along each side: enough that a slope's curve does not show. */
export const GROUND = { pieces: 3 } as const;

/** How many rows of tiles each mown stripe is. */
const STRIPE_ROWS = 2;

export interface Ground {
  /** The grass in its lighter stripe, and in its darker. */
  green: Mesh;
  mown: Mesh;
  /** The earth down the side of a step, to the ground or the water below it. */
  banks: Mesh;
}

/** The tiles of a hole that are grass: not rock, water or sand, and not the cup's, which its collar covers. */
function isGrass(l: Layout, t: number, cupTile: number): boolean {
  return !l.solid[t] && !l.water[t] && !l.sand[t] && t !== cupTile;
}

/** The ground of a hole. */
export function groundOf(l: Layout): Ground {
  const cupTile = tileAt(l, l.cup.x, l.cup.y);
  const green = new MeshBuilder(),
    mown = new MeshBuilder(),
    banks = new MeshBuilder();
  const n = GROUND.pieces;
  // the height of the ground of tile `t` at a point: its own step, whichever tile the point's edge also bounds
  const at = (t: number, x: number, y: number) => l.floor[t] + terrainAt(l, x, y);
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (!isGrass(l, t, cupTile)) continue;
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    const x0 = l.originX + tx * TILE,
      y0 = l.originY + ty * TILE;
    const b = Math.floor(ty / STRIPE_ROWS) % 2 ? mown : green;
    const base = b.vertexCount;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = x0 + (i / n) * TILE,
          y = y0 + (j / n) * TILE;
        const [sx, sy] = slopeAt(l, x, y);
        const k = 1 / Math.hypot(sx, sy, 1);
        b.vertex(x, y, at(t, x, y), -sx * k, -sy * k, k, i / n, j / n);
      }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        b.quad(a, a + 1, a + n + 2, a + n + 1);
      }
    // the earth down each side where what is beside it lies lower: another tile's lower step, or water, whose sheet lies
    // at nought; rock has its rail, which stands over the edge
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = tx + ox,
        ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
      const u = ny * l.cols + nx;
      if (l.solid[u]) continue;
      // the edge, from one end to the other, wound so its face looks out toward the neighbour
      const ex = ox > 0 ? x0 + TILE : ox < 0 ? x0 : null,
        ey = oy > 0 ? y0 + TILE : oy < 0 ? y0 : null;
      for (let k = 0; k < n; k++) {
        const s0 = k / n,
          s1 = (k + 1) / n;
        // along the edge, turning so that the face's outside is toward (ox, oy)
        const p = (s: number): [number, number] =>
          ex !== null
            ? [ex, oy === 0 && ox > 0 ? y0 + s * TILE : y0 + (1 - s) * TILE]
            : [x0 + (oy > 0 ? 1 - s : s) * TILE, ey!];
        const [ax, ay] = p(s0),
          [bx, by] = p(s1);
        const below = (x: number, y: number) => (l.water[u] ? 0 : at(u, x, y));
        const topA = at(t, ax, ay),
          topB = at(t, bx, by),
          lowA = below(ax, ay),
          lowB = below(bx, by);
        const tallA = topA - lowA > 1e-4,
          tallB = topB - lowB > 1e-4;
        if (!tallA && !tallB) continue;
        // narrowing to nothing at one end, as a step's edge meets the water's level: a triangle, not a quad half flat
        if (!tallA) tri(banks, [ax, ay, lowA], [bx, by, lowB], [bx, by, topB]);
        else if (!tallB) tri(banks, [ax, ay, lowA], [bx, by, lowB], [ax, ay, topA]);
        else face(banks, [ax, ay, lowA], [bx, by, lowB], [bx, by, topB], [ax, ay, topA]);
      }
    }
  }
  return { green: green.build(), mown: mown.build(), banks: banks.build() };
}

/**
 * How the ground stands round the cup: the height of the cup's middle, and
 * on a hole that slopes, how high the ground is at a point measured from
 * there, for the collar and the rim to lie on. It is the cup's own step and
 * the slope, as the ground beside it is drawn from, and never the step of
 * the tile next door, which a point on the tile's edge would otherwise read.
 */
export function cupGround(l: Layout): { z: number; height?: (x: number, y: number) => number } {
  const { x, y } = l.cup;
  const step = stepAt(l, x, y);
  const z = step + terrainAt(l, x, y);
  if (!l.terrain.some((h) => h !== 0)) return { z };
  return { z, height: (dx, dy) => step + terrainAt(l, x + dx, y + dy) - z };
}

/**
 * The rail's figures: how far its top edges are rounded over, how far down
 * its sides the cap's paint comes, below the round, and how many pieces the
 * round is turned in. The round begins above the middle of a ball on the
 * grass, so the side the ball meets is plumb where it meets it.
 */
export const RAIL = { round: 0.5, cap: 0.72, arc: 3 } as const;

/** The rail as it is drawn: its cap, and its sides below it, each a colour. */
export interface Rails {
  /** Its top, rounded over every edge that stands in the open, and its sides down to the cap's line: painted. */
  cap: Mesh;
  /** Its sides below the cap, down into the rough: the timber. */
  sides: Mesh;
}

/** A corner of a face as it is drawn: where it is, and the surface's normal there. */
interface Corner {
  p: V3;
  n: V3;
}

/**
 * A grid of corners into a builder, each row beside the next, every cell two
 * triangles wound as their corners' normals face and sharing them, so a
 * curved piece is shaded smooth. A cell whose corners meet in a point, as at
 * a round's pole, is a triangle, or nothing.
 */
function patch(b: MeshBuilder, rows: Corner[][]) {
  const ids = rows.map((row) => row.map(({ p, n }) => b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0)));
  const one = (cells: [number, number][]) => {
    const [P, Q, R] = cells.map(([i, j]) => rows[i][j]);
    const u = [Q.p[0] - P.p[0], Q.p[1] - P.p[1], Q.p[2] - P.p[2]],
      v = [R.p[0] - P.p[0], R.p[1] - P.p[1], R.p[2] - P.p[2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(g[0], g[1], g[2]) < 1e-9) return;
    const facing = [0, 1, 2].reduce((s, k) => s + g[k] * (P.n[k] + Q.n[k] + R.n[k]), 0);
    const [a, c, d] = cells.map(([i, j]) => ids[i][j]);
    if (facing > 0) b.triangle(a, c, d);
    else b.triangle(a, d, c);
  };
  for (let i = 0; i + 1 < rows.length; i++)
    for (let j = 0; j + 1 < rows[i].length; j++) {
      one([
        [i, j],
        [i, j + 1],
        [i + 1, j + 1],
      ]);
      one([
        [i, j],
        [i + 1, j + 1],
        [i + 1, j],
      ]);
    }
}

/**
 * The rail round a hole, as a rounded toy's: painted timber on each tile of
 * rail but those `left out`, from `depth` below the ground up to `height`
 * over what is beside it, drawn on its own tile and never over the grass, so
 * what is seen is the wall the ball meets. Its top is level at the highest
 * step beside it, as a timber rail stands over a raised green, and rises and
 * falls with the ground's slope, so one tile meets the next at the same
 * height. Every top edge that stands in the open is rounded over, the ball's
 * side plumb below the round; a corner that stands out is rounded too, and
 * one the grass fills stays square, as the physics' wall is there. Where a
 * higher rail meets a lower, the higher one's end closes the step.
 *
 * Each tile is drawn a quarter at a time, from each of its corners in to its
 * middle: the corner's square, rounded as its two edges and the tile across
 * the corner say, the two edges' strips beside it, and the flat between. A
 * round is cut the same way wherever it is cut, so a tile's edge meets its
 * neighbour's corner to corner and nothing opens between them.
 */
export function railsOf(l: Layout, height: number, depth: number, leftOut: ReadonlySet<number> = new Set()): Rails {
  const { round: r, cap: line, arc } = RAIL;
  const half = TILE / 2;
  const top = new MeshBuilder(),
    timber = new MeshBuilder();
  const drawn = (tx: number, ty: number) =>
    tx >= 0 &&
    ty >= 0 &&
    tx < l.cols &&
    ty < l.rows &&
    l.rail[ty * l.cols + tx] === 1 &&
    !leftOut.has(ty * l.cols + tx);
  // the highest step on the ground round each tile of rail
  const steps = new Float32Array(l.cols * l.rows);
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (!l.rail[t]) continue;
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox,
          ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
        const u = ny * l.cols + nx;
        if (!l.solid[u] && !l.water[u]) steps[t] = Math.max(steps[t], l.floor[u]);
      }
  }
  // the round, cut in `arc` pieces: at each, how far in from the side it is, how far up from where it begins, and
  // how far its normal has turned from facing out to facing up
  const turns = Array.from({ length: arc + 1 }, (_, k) => (k / arc) * (Math.PI / 2));
  const into = turns.map((a) => r * (1 - Math.cos(a))),
    rise = turns.map((a) => r * Math.sin(a));
  for (let t = 0; t < l.cols * l.rows; t++) {
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    if (!drawn(tx, ty)) continue;
    const step = steps[t];
    const zTop = (x: number, y: number) => step + terrainAt(l, x, y) + height;
    // an edge is open where no rail is drawn beside it; a step where a lower one is, which this tile's end closes
    const edge = (dx: number, dy: number): 'open' | 'closed' | 'step' => {
      if (!drawn(tx + dx, ty + dy)) return 'open';
      return steps[(ty + dy) * l.cols + tx + dx] < step - 1e-6 ? 'step' : 'closed';
    };
    const cx = l.originX + (tx + 0.5) * TILE,
      cy = l.originY + (ty + 0.5) * TILE;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        // a quarter of the tile, measured in from its corner: `a` in from the edge across X, `b` from the edge along Y
        const K = [cx + sx * half, cy + sy * half];
        const eX = edge(sx, 0),
          eY = edge(0, sy),
          across = !drawn(tx + sx, ty + sy);
        const openX = eX === 'open',
          openY = eY === 'open';
        /** A corner on the top, `up` above where the round begins, its normal `n` as on level ground, leant as the slope leans it. */
        const onTop = (a: number, b: number, up: number, n: V3): Corner => {
          const x = K[0] - sx * a,
            y = K[1] - sy * b;
          const [gx, gy] = slopeAt(l, x, y);
          const m: V3 = [n[0] - gx * n[2], n[1] - gy * n[2], n[2]];
          const k = Math.hypot(m[0], m[1], m[2]);
          return { p: [x, y, zTop(x, y) - r + up], n: [m[0] / k, m[1] / k, m[2] / k] };
        };
        const flat = (a: number, b: number) => onTop(a, b, r, [0, 0, 1]);
        /** A corner on a side, facing `n`, at the foot, the cap's line, where the round begins, or on the top at `up`. */
        const onSide = (a: number, b: number, at: 'foot' | 'line' | number, n: V3): Corner => {
          const x = K[0] - sx * a,
            y = K[1] - sy * b;
          const z = at === 'foot' ? -depth : at === 'line' ? zTop(x, y) - line : zTop(x, y) - r + at;
          return { p: [x, y, z], n };
        };
        const outX = (k: number): V3 => [sx * Math.cos(turns[k]), 0, Math.sin(turns[k])],
          outY = (k: number): V3 => [0, sy * Math.cos(turns[k]), Math.sin(turns[k])];
        const ks = turns.map((_, k) => k);

        // the corner's square
        if (openX && openY)
          // standing out: a ball's eighth round the corner, its middle a round in from both edges
          patch(
            top,
            ks.map((k) =>
              ks.map((j) => {
                const c = Math.cos(turns[k]),
                  [ca, sb] = [Math.cos(turns[j]), Math.sin(turns[j])];
                return onTop(r - r * c * ca, r - r * c * sb, rise[k], [sx * c * ca, sy * c * sb, Math.sin(turns[k])]);
              }),
            ),
          );
        else if (openX)
          patch(
            top,
            ks.map((k) => [0, r].map((b) => onTop(into[k], b, rise[k], outX(k)))),
          );
        else if (openY)
          patch(
            top,
            ks.map((k) => [0, r].map((a) => onTop(a, into[k], rise[k], outY(k)))),
          );
        else if (across) {
          // the grass in the corner, with rail along both edges: the two rounds meet in a hollow down to its corner,
          // and a flat fan beyond it
          const dip = (k: number, j: number) => {
            const c = Math.cos(turns[k]),
              [ca, sb] = [Math.cos(turns[j]), Math.sin(turns[j])];
            return onTop(into[k] * ca, into[k] * sb, rise[k], [sx * c * ca, sy * c * sb, Math.sin(turns[k])]);
          };
          patch(
            top,
            ks.map((k) => ks.map((j) => dip(k, j))),
          );
          patch(top, [ks.map((j) => dip(arc, j)), ks.map(() => flat(r, r))]);
        } else
          patch(top, [
            [flat(0, 0), flat(0, r)],
            [flat(r, 0), flat(r, r)],
          ]);
        // the two edges' strips beside it, and the flat between them
        if (openX)
          patch(
            top,
            ks.map((k) => [r, half].map((b) => onTop(into[k], b, rise[k], outX(k)))),
          );
        else
          patch(
            top,
            [0, r].map((a) => [r, half].map((b) => flat(a, b))),
          );
        if (openY)
          patch(
            top,
            ks.map((k) => [r, half].map((a) => onTop(a, into[k], rise[k], outY(k)))),
          );
        else
          patch(
            top,
            [0, r].map((b) => [r, half].map((a) => flat(a, b))),
          );
        patch(
          top,
          [r, half].map((a) => [r, half].map((b) => flat(a, b))),
        );

        // the sides that stand in the open, from the rough to the cap's line in timber and on up to the round in paint
        /** A wall along the corners `along`, each an (a, b) and its height on the top, from the rough up. */
        const wall = (along: [number, number, number | null][], n: V3) => {
          patch(timber, [
            along.map(([a, b]) => onSide(a, b, 'foot', n)),
            along.map(([a, b]) => onSide(a, b, 'line', n)),
          ]);
          patch(top, [
            along.map(([a, b]) => onSide(a, b, 'line', n)),
            along.map(([a, b, up]) => onSide(a, b, up ?? 0, n)),
          ]);
        };
        if (openX)
          wall(
            (openY ? [r, half] : [0, r, half]).map((b): [number, number, null] => [0, b, null]),
            [sx, 0, 0],
          );
        if (openY)
          wall(
            (openX ? [r, half] : [0, r, half]).map((a): [number, number, null] => [a, 0, null]),
            [0, sy, 0],
          );
        // round the corner that stands out, a post's quarter
        if (openX && openY) {
          const post = (at: 'foot' | 'line' | number) =>
            ks.map((j) => {
              const [c, s] = [Math.cos(turns[j]), Math.sin(turns[j])];
              return onSide(r - r * c, r - r * s, at, [sx * c, sy * s, 0]);
            });
          patch(timber, [post('foot'), post('line')]);
          patch(top, [post('line'), post(0)]);
        }
        // where this tile stands over a lower rail beside it, its end, up to the top as the top meets that edge
        const rounded = (open: boolean) => open || across;
        if (eX === 'step')
          wall(
            [
              ...(rounded(openY)
                ? ks.map((k): [number, number, number] => [0, into[k], rise[k]])
                : [
                    [0, 0, r],
                    [0, r, r],
                  ]),
              [0, half, r],
            ] as [number, number, number][],
            [sx, 0, 0],
          );
        if (eY === 'step')
          wall(
            [
              ...(rounded(openX)
                ? ks.map((k): [number, number, number] => [into[k], 0, rise[k]])
                : [
                    [0, 0, r],
                    [r, 0, r],
                  ]),
              [half, 0, r],
            ] as [number, number, number][],
            [0, sy, 0],
          );
      }
  }
  return { cap: top.build(), sides: timber.build() };
}
