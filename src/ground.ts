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
import { TILE, slopeAt, terrainAt, tileAt, type Layout } from './arena';
import { face, tri } from './meshes';

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
 * The rail round a hole, as one mesh: a block on each tile of rail but
 * those `left out`, from `depth` below the ground up to `height` over what is
 * beside it. Its top is level at the highest step beside it, as a timber
 * rail stands over a raised green, and at each corner rises with the slope
 * the ground has there, so on ground that slopes the rail's top slopes with
 * it and one tile meets the next at the same height, and does not step.
 */
export function railsOf(l: Layout, height: number, depth: number, leftOut: ReadonlySet<number> = new Set()): Mesh {
  const b = new MeshBuilder();
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (!l.rail[t] || leftOut.has(t)) continue;
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    // the highest step on the ground round it
    let step = 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox,
          ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
        const u = ny * l.cols + nx;
        if (!l.solid[u] && !l.water[u]) step = Math.max(step, l.floor[u]);
      }
    const x0 = l.originX + tx * TILE,
      y0 = l.originY + ty * TILE,
      x1 = x0 + TILE,
      y1 = y0 + TILE;
    const top = (x: number, y: number): [number, number, number] => [x, y, step + terrainAt(l, x, y) + height];
    const low = (x: number, y: number): [number, number, number] => [x, y, -depth];
    const [a, c, d, e] = [top(x0, y0), top(x1, y0), top(x1, y1), top(x0, y1)];
    // the top, as two triangles, since its corners need not lie in one plane
    tri(b, a, c, d);
    tri(b, a, d, e);
    // the four sides, each from the rough up to the top's edge, facing out
    face(b, low(x0, y0), low(x1, y0), c, a);
    face(b, low(x1, y0), low(x1, y1), d, c);
    face(b, low(x1, y1), low(x0, y1), e, d);
    face(b, low(x0, y1), low(x0, y0), a, e);
  }
  return b.build();
}
