/**
 * The ground past a golf hole's map: gentle hills that grow with the distance from the map's edge, and the plane under the
 * hole that follows them. The title picture's landscape rolls away from the course; without this the woods, the bunting and
 * the backdrop stood on one flat plain at a constant depth, and the plane's straight edge threw the stepped shadow of the
 * out of bounds on to it. Everything past the map stands on `groundZOf`, and the plane under it is that ground a little
 * lower, so the two never fight and nothing is left under it.
 *
 * Worked out from the hole's map and its name, never the game's chance, so a hole looks the same every time and nothing of
 * play is moved by it. The hole's own ground is read through `heightAt`, so the world meets the map's edge without a step.
 */
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, heightAt, type Layout } from './arena';
import { LAKE_SHORE, lakeShapeOf, type LakeShape } from './backdrop';
import { gradientNoise } from './noise';
import { nameSeed } from './shaping';

/**
 * The hills' figures: the edge's own height is taken out over `taper` yards; the hills are `near` high at their lowest
 * reckoning close to the edge and `far` high a `rise` out, grow from nothing over `start` yards, and are gone again from
 * `fall` yards (over its second figure) to the `reach` where the world ends; the noise has two sizes of swell, `swell` and
 * `ripple` yards across, the second half as strong.
 */
export const HILLS = {
  taper: 30,
  near: 3,
  far: 25,
  rise: 260,
  start: 50,
  fall: [320, 100],
  reach: 420,
  swell: 90,
  ripple: 38,
} as const;

/** How far the plane lies under the ground it follows, so a ground drawn on it is never hidden by it. */
export const PLANE_DROP = 0.3;

const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * How high the ground stands at a point of the map or past it, and where it was carved for the backdrop's lake: the level of
 * the water, the deepest of the hollow, and how far a point is carved, from nought (not at all) to one (to the bed).
 */
export type GroundZ = ((x: number, y: number) => number) & { lake?: Carving };

export interface Carving {
  /** Where the lake's water lies, and the bed under it. */
  level: number;
  bed: number;
  /** The ground at a point of the hollow, given what the hills stand at there; the hills' own anywhere else. */
  apply: (x: number, y: number, hills: number) => number;
  /** How much of the lake's own a point is: one in the water, and nought from `HOLLOW.fall` yards out from its shore. */
  weight: (x: number, y: number) => number;
  /** The box the hollow lies in, hills falling to it included. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * The lake's hollow: the ground goes down from the shore, where it is the water's own level, to a bed `depth` under the water
 * over `inner` yards, and out from the shore it rises over `fall` yards to what the hills stand at, so the hills fall to the
 * lake as the title picture's do; `spacing` is how far apart the hills are read to find the lowest they stand over the hollow.
 * Without a hollow the hills rise over a level lake and hide it.
 */
export const HOLLOW = { fall: 60, inner: 40, depth: 3, spacing: 40 } as const;

/** The highest the hills stand `out` yards past a map's edge, before the edge's own height is added. */
export const hillsTop = (out: number) => HILLS.near + (HILLS.far - HILLS.near) * smooth(out / HILLS.rise);

/**
 * The ground's height at any point of a golf hole called `name` laid out as `layout`: inside the map its own, at the map's
 * edge the same, and past it the edge's height tapering to nothing while hills come up from nothing, out to `HILLS.reach`
 * and flat from there, and then the lake's hollow is cut out of that where the backdrop's lake lies (past `reach` as well, since
 * the lake is). Smooth everywhere. The function keeps the edge's heights it has worked out, for as long as it is held.
 */
export function groundZOf(layout: Layout, name: string): GroundZ {
  const raw = hillsOf(layout, name);
  const carving = carvingOf(lakeShapeOf(layout, name), raw);
  const { box, apply } = carving;
  const z: GroundZ = (x, y) => {
    const h = raw(x, y);
    return x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1 ? h : apply(x, y, h);
  };
  z.lake = carving;
  return z;
}

/**
 * The hills before the lake's hollow is cut: the edge's own height tapering out and the noise's swells coming up (see `groundZOf`).
 */
function hillsOf(layout: Layout, name: string): (x: number, y: number) => number {
  const x0 = layout.originX + 0.01,
    y0 = layout.originY + 0.01,
    x1 = layout.originX + layout.cols * TILE - 0.01,
    y1 = layout.originY + layout.rows * TILE - 0.01;
  const seed = nameSeed(name);
  const a = gradientNoise(seed),
    b = gradientNoise(seed + 77);
  const edges = new Map<number, number>();
  const hillHeight = (x: number, y: number) =>
    a(x / HILLS.swell, y / HILLS.swell) + 0.5 * b(x / HILLS.ripple, y / HILLS.ripple);
  return (x, y) => {
    const cx = Math.min(x1, Math.max(x0, x)),
      cy = Math.min(y1, Math.max(y0, y));
    const out = Math.hypot(x - cx, y - cy);
    if (out >= HILLS.reach) return 0;
    let edge: number;
    if (out === 0) edge = Math.max(0, heightAt(layout, cx, cy));
    else {
      const key = (Math.round(cx * 100) + 1e6) * 2e6 + Math.round(cy * 100) + 1e6;
      const known = edges.get(key);
      edge = known ?? Math.max(0, heightAt(layout, cx, cy));
      if (known === undefined) edges.set(key, edge);
    }
    edge *= Math.max(0, 1 - out / HILLS.taper);
    if (out === 0) return edge;
    const h01 = Math.min(1, Math.max(0, 0.55 + 0.5 * hillHeight(x, y)));
    const amp = hillsTop(out);
    return edge + h01 * amp * smooth(out / HILLS.start) * (1 - smooth((out - HILLS.fall[0]) / HILLS.fall[1]));
  };
}

/**
 * The offsets from a map's edge at which the plane has a line: a tile apart close to the map, where the stepped edge of the
 * out of bounds would throw a stair of shadow on anything coarser, then wider as the hills are smoother and seen from
 * further, out past `HILLS.reach`.
 */
export const PLANE_LINES: readonly number[] = (() => {
  const out: number[] = [];
  let d = 0;
  while (d < HILLS.reach + 48) {
    d += d < 12 ? TILE : d < 96 ? 12 : d < 192 ? 24 : 48;
    out.push(d);
  }
  return out;
})();

/**
 * The plane under a golf hole: a grid of the ground (`ground`, lowered by `PLANE_DROP`) a tile apart over the map and
 * wider past it, with the ground's own slope for each vertex's normal, a hole in it for every tile of water (a pond's
 * surface lies there) and none where the ground drawn over it hides it, and flat out to `half` from the grid's edge,
 * where the ground is nothing.
 */
export function planeOf(layout: Layout, ground: GroundZ, half: number): Mesh {
  // where the ground was carved for a lake the grid goes on, a line every `PLANE_LINES`' last step, until the hollow is in it:
  // the flat plane past the grid would otherwise lie over the water
  const box = ground.lake?.box;
  const lines = (origin: number, n: number, lo: number, hi: number) => {
    const xs: number[] = [];
    const end = origin + n * TILE;
    const last = PLANE_LINES[PLANE_LINES.length - 1],
      step = last - PLANE_LINES[PLANE_LINES.length - 2];
    const down = PLANE_LINES.slice(),
      up = PLANE_LINES.slice();
    for (let d = last; origin - d > lo;) down.push((d += step));
    for (let d = last; end + d < hi;) up.push((d += step));
    for (let k = down.length - 1; k >= 0; k--) xs.push(origin - down[k]);
    for (let k = 0; k <= n; k++) xs.push(origin + k * TILE);
    for (const d of up) xs.push(end + d);
    return xs;
  };
  const xs = lines(layout.originX, layout.cols, box?.x0 ?? Infinity, box?.x1 ?? -Infinity),
    ys = lines(layout.originY, layout.rows, box?.y0 ?? Infinity, box?.y1 ?? -Infinity);
  const nx = xs.length,
    ny = ys.length;
  const { cols, rows, solid, water } = layout;
  const tileOf = (v: number, origin: number) => Math.round((v - origin) / TILE);
  // which cells are drawn: none for water, and none under the ground that is drawn over them, which is every tile of the
  // map with no rock, no water and no edge of the map in the tiles round it. What is left is the rock and the plain, and
  // the ground's edge, where a shadow falls on it.
  const drawn = (i: number, j: number) => {
    const tx = tileOf(xs[i], layout.originX),
      ty = tileOf(ys[j], layout.originY);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return true;
    if (water[ty * cols + tx]) return false;
    for (let v = -1; v <= 1; v++)
      for (let u = -1; u <= 1; u++) {
        const x = tx + u,
          y = ty + v;
        if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
        if (solid[y * cols + x] || water[y * cols + x]) return true;
      }
    return false;
  };
  // the ground's height at each line crossing, worked out only where a drawn cell has a corner or a neighbour of one
  const z = new Float32Array(nx * ny).fill(NaN);
  const height = (i: number, j: number) => {
    const v = j * nx + i;
    if (z[v] !== z[v]) z[v] = ground(xs[i], ys[j]) - PLANE_DROP;
    return z[v];
  };
  const positions = new Float32Array(nx * ny * 3 + 4 * 4 * 3),
    normals = new Float32Array(positions.length),
    uvs = new Float32Array(nx * ny * 2 + 4 * 4 * 2);
  const written = new Uint8Array(nx * ny);
  const vertex = (i: number, j: number) => {
    const v = j * nx + i;
    if (written[v]) return v;
    written[v] = 1;
    const i0 = Math.max(0, i - 1),
      i1 = Math.min(nx - 1, i + 1),
      j0 = Math.max(0, j - 1),
      j1 = Math.min(ny - 1, j + 1);
    const sx = (height(i1, j) - height(i0, j)) / (xs[i1] - xs[i0]),
      sy = (height(i, j1) - height(i, j0)) / (ys[j1] - ys[j0]);
    const k = 1 / Math.hypot(sx, sy, 1);
    positions[v * 3] = xs[i];
    positions[v * 3 + 1] = ys[j];
    positions[v * 3 + 2] = height(i, j);
    normals[v * 3] = -sx * k;
    normals[v * 3 + 1] = -sy * k;
    normals[v * 3 + 2] = k;
    uvs[v * 2] = xs[i] / TILE;
    uvs[v * 2 + 1] = ys[j] / TILE;
    return v;
  };
  // two triangles to a cell at most, and four flat pieces of two: the array is made once at its greatest and cut to what was written
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6 + 4 * 6);
  let used = 0;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      if (!drawn(i, j)) continue;
      const a = vertex(i, j),
        b = vertex(i + 1, j),
        c = vertex(i + 1, j + 1),
        d = vertex(i, j + 1);
      indices[used++] = a;
      indices[used++] = b;
      indices[used++] = c;
      indices[used++] = a;
      indices[used++] = c;
      indices[used++] = d;
    }
  // and out past the grid, flat and level with where the ground ends, to the horizon
  const cx = layout.originX + (layout.cols * TILE) / 2,
    cy = layout.originY + (layout.rows * TILE) / 2;
  const [fx0, fx1, fy0, fy1] = [xs[0], xs[nx - 1], ys[0], ys[ny - 1]];
  const flat = (n: number, ax: number, ay: number, bx: number, by: number) => {
    const base = nx * ny + n * 4;
    [
      [ax, ay],
      [bx, ay],
      [bx, by],
      [ax, by],
    ].forEach(([x, y], k) => {
      positions.set([x, y, -PLANE_DROP], (base + k) * 3);
      normals.set([0, 0, 1], (base + k) * 3);
      uvs.set([x / TILE, y / TILE], (base + k) * 2);
    });
    for (const k of [0, 1, 2, 0, 2, 3]) indices[used++] = base + k;
  };
  const lo = Math.min(cx - half, fx0 - TILE),
    hi = Math.max(cx + half, fx1 + TILE),
    loY = Math.min(cy - half, fy0 - TILE),
    hiY = Math.max(cy + half, fy1 + TILE);
  flat(0, lo, loY, hi, fy0);
  flat(1, lo, fy1, hi, hiY);
  flat(2, lo, fy0, fx0, fy1);
  flat(3, fx1, fy0, hi, fy1);
  return { positions, normals, uvs, indices: indices.slice(0, used) };
}

/**
 * The hollow of a lake: the ground carved down to a bed `HOLLOW.depth` under the water over the lake's fan, and falling back to
 * the hills over `HOLLOW.fall` yards outside its shore, smoothly. The water lies two under the lowest the hills stand in the
 * hollow's reach, as the backdrop's lake always did, so the ground round the shore is never lower than the water.
 */
function carvingOf(shape: LakeShape, raw: (x: number, y: number) => number): Carving {
  // the fan's outline: its middle, then the shore from one end to the other
  const n = LAKE_SHORE + 2;
  const px = new Float64Array(n),
    py = new Float64Array(n);
  px[0] = shape.middle[0];
  py[0] = shape.middle[1];
  for (let j = 0; j <= LAKE_SHORE; j++) {
    px[j + 1] = shape.shore[2 * j];
    py[j + 1] = shape.shore[2 * j + 1];
  }
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i < n; i++) {
    box.x0 = Math.min(box.x0, px[i] - HOLLOW.fall);
    box.x1 = Math.max(box.x1, px[i] + HOLLOW.fall);
    box.y0 = Math.min(box.y0, py[i] - HOLLOW.fall);
    box.y1 = Math.max(box.y1, py[i] + HOLLOW.fall);
  }
  /** How far a point is from the outline, with a minus where it is inside it. */
  const signed = (x: number, y: number) => {
    let near = Infinity,
      inside = false;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const ex = px[k] - px[i],
        ey = py[k] - py[i];
      const l2 = ex * ex + ey * ey;
      const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - px[i]) * ex + (y - py[i]) * ey) / l2)) : 0;
      near = Math.min(near, Math.hypot(px[i] + u * ex - x, py[i] + u * ey - y));
      if (py[i] > y !== py[k] > y && x < px[i] + ((y - py[i]) / (py[k] - py[i])) * ex) inside = !inside;
    }
    return inside ? -near : near;
  };
  const weight = (x: number, y: number) => {
    if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) return 0;
    const d = signed(x, y);
    return d <= 0 ? 1 : 1 - smooth(d / HOLLOW.fall);
  };
  // the water: two under the lowest of the hills anywhere the hollow reaches
  let low = Infinity;
  for (let y = box.y0; y <= box.y1; y += HOLLOW.spacing)
    for (let x = box.x0; x <= box.x1; x += HOLLOW.spacing) if (weight(x, y) > 0) low = Math.min(low, raw(x, y));
  if (low === Infinity) low = raw(shape.middle[0], shape.middle[1]);
  const level = low - 2;
  const bed = level - HOLLOW.depth;
  const apply = (x: number, y: number, hills: number) => {
    const d = signed(x, y);
    if (d >= HOLLOW.fall) return hills;
    // the shore is the water's level, and the ground leaves it flat: down into the bed, and up into the hills
    if (d > 0) return level + (Math.max(hills, level) - level) * smooth(d / HOLLOW.fall);
    return level - HOLLOW.depth * smooth(-d / HOLLOW.inner);
  };
  return { level, bed, apply, weight, box };
}
