/**
 * The ground as it is drawn: one mesh over the green that follows its slopes, in its stripes, and earth where it
 * steps down; the rail round it, a rounded toy's, drawn on its own tiles and no further; and the grass round the cup,
 * which meets the ground without a seam.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { BALL, KIND_RADIUS, STEP, TILE, WATER_LEVEL, heightAt, layoutOf, terrainAt, type Layout } from '../src/arena';
import { COURSES, CUP } from '../src/course';
import { GROUND, RAIL, cupGround, groundOf, railsOf, type Rails } from '../src/ground';
import { BUDGET, collar, type V3 } from '../src/models';
import { PALETTE as MODELS } from '../src/models/palette';
import { PALETTE } from '../src/scene';
import { KINDS, ROUGH } from '../src/turf';
import { grassGround } from 'artshape-render/game/grass';

/** Every triangle of a mesh, as its three corners. */
function triangles(mesh: Mesh): [number, number, number][][] {
  const p = mesh.positions,
    ix = mesh.indices;
  const out: [number, number, number][][] = [];
  for (let t = 0; t < ix.length; t += 3)
    out.push(
      [0, 1, 2].map((k) => [p[ix[t + k] * 3], p[ix[t + k] * 3 + 1], p[ix[t + k] * 3 + 2]] as [number, number, number]),
    );
  return out;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const k = Math.hypot(...a);
  return [a[0] / k, a[1] / k, a[2] / k];
};
/** A point as a key, to a millimetre, so the same corner from two faces is the same key. */
const key = (p: V3) => p.map((v) => Math.round(v * 1e3) + 0).join(',');
/** A triangle's area as seen from above. */
const flatArea = ([a, b, c]: [number, number, number][]) =>
  Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
/** How many tiles of grass a hole has: not rock, water, sand or the cup's. */
function grassTiles(l: Layout): number {
  const cup = Math.floor((l.cup.y - l.originY) / TILE) * l.cols + Math.floor((l.cup.x - l.originX) / TILE);
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t] && !l.sand[t] && t !== cup) n++;
  return n;
}

const MAP = [
  '#########',
  '#.......#',
  '#...C...#',
  ...Array.from({ length: 4 }, () => '#.......#'),
  '#..11...#',
  '#..11.~~#',
  '#.......#',
  '#..ss...#',
  '#...T...#',
  '#########',
];
const TERRAIN = MAP.map((r, i) => (i >= 7 && i <= 9 ? '0002210000'.slice(0, r.length) : '0'.repeat(r.length)));

describe('the ground', () => {
  for (const [label, l] of [
    ['flat', layoutOf(MAP)],
    ['sloped', layoutOf(MAP, TERRAIN)],
  ] as const) {
    it(`covers every tile of grass on a ${label} hole once, in its stripes, and none of the rest`, () => {
      const g = groundOf(l);
      const area = [...triangles(g.green), ...triangles(g.mown)].reduce((a, t) => a + flatArea(t), 0);
      expect(area).toBeCloseTo(grassTiles(l) * TILE * TILE, 3);
      // each stripe on its own rows only, two rows of tiles each, and both there
      for (const [mesh, stripe] of [
        [g.mown, 1],
        [g.green, 0],
      ] as const) {
        expect(triangles(mesh).length).toBeGreaterThan(0);
        for (const [a, b, c] of triangles(mesh)) {
          const row = Math.floor(((a[1] + b[1] + c[1]) / 3 - l.originY) / TILE);
          expect(Math.floor(row / 2) % 2, `a triangle of stripe ${stripe} on row ${row}`).toBe(stripe);
        }
      }
      for (const tri of [...triangles(g.green), ...triangles(g.mown)]) {
        const [a, b, c] = tri;
        // facing up, and lying on the ground: its middle within a hair of the ground's height there
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        expect(nz, 'facing up').toBeGreaterThan(0);
        const mx = (a[0] + b[0] + c[0]) / 3,
          my = (a[1] + b[1] + c[1]) / 3,
          mz = (a[2] + b[2] + c[2]) / 3;
        // cut in thirds of a tile, the flat pieces lie within a couple of millimetres of the smooth ground
        expect(Math.abs(mz - heightAt(l, mx, my)), `at ${mx.toFixed(2)},${my.toFixed(2)}`).toBeLessThan(0.03);
      }
    });
  }

  it('shows earth where the ground steps down, from the top of the step to the ground below, and nowhere on the level', () => {
    for (const l of [layoutOf(MAP), layoutOf(MAP, TERRAIN)]) {
      const earth = triangles(groundOf(l).banks);
      expect(earth.length, 'the step has sides').toBeGreaterThan(0);
      for (const tri of earth) {
        const top = Math.max(...tri.map((p) => p[2])),
          bottom = Math.min(...tri.map((p) => p[2]));
        // upright, along a tile's edge, and not a face lying flat
        expect(top - bottom, 'standing up').toBeGreaterThan(1e-4);
        const alongX = tri.every((p) => Math.abs(p[1] - tri[0][1]) < 1e-6),
          alongY = tri.every((p) => Math.abs(p[0] - tri[0][0]) < 1e-6);
        expect(alongX || alongY, 'on the edge of a tile').toBe(true);
      }
      // the raised tiles' west faces, on the line between column 2 and 3: each the full height of the step
      const west = earth.filter((t) => t.every((p) => Math.abs(p[0] - (l.originX + 3 * TILE)) < 1e-6));
      expect(west.length).toBeGreaterThan(0);
      for (const tri of west)
        expect(Math.max(...tri.map((p) => p[2])) - Math.min(...tri.map((p) => p[2]))).toBeGreaterThan(STEP - 1e-3);
    }
    const flat = layoutOf(MAP.map((r) => r.replace(/[1~]/g, '.')));
    expect(triangles(groundOf(flat).banks).length, 'no step and no water, no earth').toBe(0);
  });

  it('is painted in its two stripes, the mown one lighter than the other by the same share in every colour', () => {
    const [r, g, b] = PALETTE.grass,
      [mr, mg, mb] = PALETTE.grassMown;
    const share = mg / g;
    expect(share, 'lighter, and not so much it is another green').toBeGreaterThan(1.05);
    expect(share).toBeLessThan(1.6);
    expect(mr / r).toBeCloseTo(share, 6);
    expect(mb / b).toBeCloseTo(share, 6);
    // a grass green: green the most of the three, and not the grey of a green seen through fog
    expect(g).toBeGreaterThan(r * 1.3);
    expect(g).toBeGreaterThan(b * 1.3);
  });

  it('is the same green, rough and rail in the models’ showcase as on the course, from the one palette', () => {
    for (const [name, scene, models] of [
      ['green', PALETTE.grass, MODELS.grass],
      ['mown', PALETTE.grassMown, MODELS.grassMown],
      ['rail', PALETTE.rail, MODELS.rail],
      ['rail’s cap', PALETTE.railCap, MODELS.railCap],
      ['rough', PALETTE.rough, MODELS.rough],
    ] as const)
      for (let c = 0; c < 3; c++) expect(scene[c], `${name}, channel ${c}`).toBeCloseTo(models[c], 6);
    // and the rough's ground is the colour between its blades, so it does not show through them as a colour of its own
    const between = grassGround(KINDS[ROUGH]);
    for (let c = 0; c < 3; c++) expect(MODELS.rough[c]).toBeCloseTo(between[c], 6);
  });

  it('is cut fine enough to follow a slope: a few pieces a tile', () => {
    expect(GROUND.pieces).toBe(3);
    const l = layoutOf(MAP);
    expect(triangles(groundOf(l).green).length + triangles(groundOf(l).mown).length).toBe(grassTiles(l) * 2 * 3 * 3);
  });
});

describe('the rail', () => {
  /** A rise across the whole hole, rail and all, down the rows past the cup's level ground. */
  const ACROSS = MAP.map((r, i) =>
    String(['0', '0', '0', '0', '0', '0', '1', '2', '2', '1'][i] ?? '0').repeat(r.length),
  );
  /** A rail beside a raised step, which stands over the step: down the west rail, and along the north rail. */
  const STEPPED = MAP.map((r, i) => (i === 7 ? '#1.11...#' : r));
  const STEPPED_ALONG = MAP.map((r, i) => (i === 1 ? '#...1...#' : r));
  /**
   * Every T, end and turn a rail can make: a wall into the course from each
   * side, ending in the open; a post of rail on its own; and an elbow jutting
   * into the course, as the dog-leg's does.
   */
  const JOINS = [
    '###########',
    '#.........#',
    '#..C......#',
    '####...####',
    '#.........#',
    '#...#.....#',
    '#.........#',
    '#.....#####',
    '#.....#    ',
    '#..T..#    ',
    '#######    ',
  ];

  /** The rail of every hole of every course, with the tiles under a windmill's tower left out as the scene leaves them. */
  const everyHole = (): [string, Layout, Set<number>][] =>
    COURSES.flatMap((c) =>
      c.holes.map((h): [string, Layout, Set<number>] => {
        const l = layoutOf(h.map, h.terrain);
        const under = new Set<number>();
        for (const o of h.obstacles ?? [])
          if (o.kind === 'windmill') {
            const ty = l.rows - 1 - o.at[1];
            for (const side of [-1, 1]) under.add(ty * l.cols + o.at[0] + side);
          }
        return [h.name, l, under];
      }),
    );
  /** Every layout the rail is tried on: every hole, and those made here for what no hole has. */
  const everyRail = (): [string, Layout, Set<number>][] => [
    ...everyHole(),
    ['a test hole', layoutOf(MAP), new Set()],
    ['a test hole that slopes', layoutOf(MAP, ACROSS), new Set()],
    ['every join', layoutOf(JOINS), new Set()],
    [
      'every join, sloping',
      layoutOf(
        JOINS,
        JOINS.map((r, i) => String(Math.min(i, 6)).repeat(r.length)),
      ),
      new Set(),
    ],
  ];

  /** The rail's cap and its sides, as the triangles of both, each with its three corners and their normals. */
  function faces(r: Rails): { p: V3[]; n: V3[]; cap: boolean }[] {
    const out: { p: V3[]; n: V3[]; cap: boolean }[] = [];
    for (const [mesh, cap] of [
      [r.cap, true],
      [r.sides, false],
    ] as const) {
      const { positions: p, normals: n, indices: ix } = mesh;
      for (let t = 0; t < ix.length; t += 3) {
        const at = [0, 1, 2].map((k) => ix[t + k] * 3);
        out.push({
          p: at.map((i) => [p[i], p[i + 1], p[i + 2]] as V3),
          n: at.map((i) => [n[i], n[i + 1], n[i + 2]] as V3),
          cap,
        });
      }
    }
    return out;
  }
  /** The highest the rail stands over a point, or -Infinity where it is not over it: its top, seen from above. */
  function topAt(r: Rails, x: number, y: number): number {
    let top = -Infinity;
    for (const { p } of faces(r)) {
      const [a, b, c] = p;
      const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d,
        v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
      if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
      top = Math.max(top, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
    }
    return top;
  }

  /** The middle of every tile of rail that is drawn. */
  const railTiles = (l: Layout, leftOut: Set<number> = new Set()) => {
    const out: { t: number; x: number; y: number }[] = [];
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.rail[t] && !leftOut.has(t))
        out.push({
          t,
          x: l.originX + ((t % l.cols) + 0.5) * TILE,
          y: l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
        });
    return out;
  };

  it('stands a rail height over the step beside it on the flat, its top level, as it always did', () => {
    const l = layoutOf(MAP);
    const rails = railsOf(l, 1.6, 3);
    const heights = new Set(railTiles(l).map(({ x, y }) => topAt(rails, x, y).toFixed(4)));
    // over level grass all round: this hole's raised step is nowhere beside the rail
    expect([...heights]).toEqual(['1.6000']);
    // and nothing of it higher than its top
    expect(Math.max(...faces(rails).flatMap(({ p }) => p.map((q) => q[2])))).toBeCloseTo(1.6, 6);
    // and a rail beside a raised step stands over the step, level
    const stepped = layoutOf(STEPPED);
    const steppedRails = railsOf(stepped, 1.6, 3);
    const over = new Set(railTiles(stepped).map(({ x, y }) => topAt(steppedRails, x, y).toFixed(4)));
    expect([...over].sort()).toEqual(['1.6000', (1.6 + STEP).toFixed(4)].sort());
  });

  it('follows ground that slopes along its top, one tile meeting the next at the same height', () => {
    const l = layoutOf(MAP, ACROSS);
    const rails = railsOf(l, 1.6, 3);
    // along the middle of the west rail, down the rows the slope is on, at each tile's end: the slope's height there
    // and a rail's more, the same from either tile
    const x = l.originX + TILE / 2;
    for (let row = 6; row <= 10; row++) {
      const y = l.originY + (l.rows - row) * TILE;
      const below = topAt(rails, x, y - 1e-3),
        above = topAt(rails, x, y + 1e-3);
      expect(below, `row ${row}`).toBeCloseTo(terrainAt(l, x, y) + 1.6, 2);
      expect(Math.abs(below - above), `row ${row}: the two tiles meet`).toBeLessThan(1e-2);
    }
    // somewhere it is not level: the slope shows in it
    const west = railTiles(l).filter((m) => Math.abs(m.x - x) < 1e-6);
    expect(new Set(west.map((m) => topAt(rails, m.x, m.y).toFixed(3))).size).toBeGreaterThan(2);
    // and on every hole that slopes, over every tile, it stands a rail's height over the ground beside it, wherever
    // it is looked at on its top: between the corners it is cut at, too
    for (const [name, h, leftOut] of everyHole().filter(([, h]) => h.terrain.some((v) => v !== 0))) {
      const r = railsOf(h, 1.6, 3, leftOut);
      for (const m of railTiles(h, leftOut))
        for (const [dx, dy] of [
          [0, 0],
          [0.37, -0.21],
          [-0.8, 0.9],
        ]) {
          const want = topAt(r, m.x + dx, m.y + dy) - terrainAt(h, m.x + dx, m.y + dy);
          const step = Math.round((want - 1.6) / STEP) * STEP;
          expect(Math.abs(want - 1.6 - step), `${name} at ${m.x + dx},${m.y + dy}`).toBeLessThan(0.03);
        }
    }
  });

  it('is drawn on its own tiles and no further, so what is seen is the wall the ball meets', () => {
    for (const [name, l, leftOut] of everyRail()) {
      const rails = railsOf(l, 1.6, 3, leftOut);
      const tileOf = (x: number, y: number) =>
        Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE);
      const drawn = (t: number) => t >= 0 && l.rail[t] === 1 && !leftOut.has(t);
      for (const { p } of faces(rails)) {
        // every face over a tile of rail that is drawn, or on its edge: its middle, a hair in behind the way it faces
        const g = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
        const mx = (p[0][0] + p[1][0] + p[2][0]) / 3 - g[0] * 1e-4,
          my = (p[0][1] + p[1][1] + p[2][1]) / 3 - g[1] * 1e-4;
        expect(drawn(tileOf(mx, my)), `${name}: a face at ${mx.toFixed(2)},${my.toFixed(2)}`).toBe(true);
        // and every corner of it within the square of one, nudged in so a point on its edge is inside it
        for (const [x, y] of p) {
          const inside = [-1e-6, 1e-6].some((ex) => [-1e-6, 1e-6].some((ey) => drawn(tileOf(x + ex, y + ey))));
          expect(inside, `${name}: a corner at ${x.toFixed(3)},${y.toFixed(3)}`).toBe(true);
        }
      }
    }
  });

  it('is closed all round but underneath, at every corner, T, end and step the maps make', () => {
    const check = (name: string, l: Layout, leftOut: Set<number>) => {
      const rails = railsOf(l, 1.6, 3, leftOut);
      /**
       * Whether an edge lies where a lower rail meets a higher one's end: on
       * the line between two tiles of rail whose tops differ, no higher than
       * the higher top, so the higher tile's end covers it.
       */
      const step = (a: V3, b: V3) =>
        [0, 1].some((axis) => {
          const origin = axis === 0 ? l.originX : l.originY;
          const u = (a[axis] - origin) / TILE;
          if (Math.abs(b[axis] - a[axis]) > 1e-6 || Math.abs(u - Math.round(u)) > 1e-6) return false;
          const other = (a[1 - axis] + b[1 - axis]) / 2;
          const [lo, hi] = [-0.05, 0.05].map((d) =>
            axis === 0 ? topAt(rails, a[0] + d, other) : topAt(rails, other, a[1] + d),
          );
          return Math.abs(hi - lo) > 0.1 && Math.max(a[2], b[2]) <= Math.max(hi, lo) + 1e-6;
        });
      const edges = new Map<string, number>();
      for (const { p } of faces(rails))
        for (let k = 0; k < 3; k++) {
          const e = `${key(p[k])}>${key(p[(k + 1) % 3])}`;
          edges.set(e, (edges.get(e) ?? 0) + 1);
        }
      for (const [e, n] of edges) {
        expect(n, `${name}: an edge drawn twice the same way, ${e}`).toBe(1);
        const [a, b] = e.split('>');
        if (edges.has(`${b}>${a}`)) continue;
        const [pa, pb] = [a, b].map((s) => s.split(',').map((v) => +v / 1e3) as V3);
        // only its foot is open, down in the rough; or where a lower rail meets a higher one's end, whose end covers it
        const foot = pa[2] === -3 && pb[2] === -3;
        expect(foot || step(pa, pb), `${name}: an edge with nothing on its other side, ${e}`).toBe(true);
      }
    };
    for (const [name, l, leftOut] of everyRail()) check(name, l, leftOut);
    // beside a raised step the rail stands higher: where it steps down, down the hole or across it, the higher tile's
    // end closes it, and the lower one's top meets that end
    for (const [name, map] of [
      ['a rail beside a step, down the hole', STEPPED],
      ['a rail beside a step, across it', STEPPED_ALONG],
    ] as const) {
      const l = layoutOf(map);
      const tops = new Set(railTiles(l).map(({ x, y }) => topAt(railsOf(l, 1.6, 3), x, y).toFixed(4)));
      expect(tops.size, `${name}: it steps`).toBe(2);
      check(name, l, new Set());
    }
  });

  it('rounds its top over where the ball meets it and stands plumb below, as high as the physics walls it', () => {
    const l = layoutOf(COURSES[0].holes[0].map);
    const rails = railsOf(l, 1.6, 3);
    const { round: r } = RAIL;
    // the west rail, half way up the hole, across its inner edge
    const edge = l.originX + TILE,
      y = l.originY + 8.5 * TILE;
    for (let k = 1; k <= 20; k++) {
      const into = (k / 20) * r;
      const z = topAt(rails, edge - into, y);
      // on the round, never outside it and never far inside it, measured from its middle: cut in a few pieces, the
      // ends of each on it
      const out = Math.hypot(r - into, z - (1.6 - r));
      expect(out, `${into.toFixed(3)} in`).toBeLessThanOrEqual(r + 1e-6);
      expect(out, `${into.toFixed(3)} in`).toBeGreaterThan(r - 0.02);
    }
    for (const into of [r, 1, TILE / 2, TILE - r]) expect(topAt(rails, edge - into, y)).toBeCloseTo(1.6, 6);
    // the side the ball meets is plumb on the tile's edge, from the rough up to where the round begins: above the
    // middle of a ball on the grass, so the ball touches it where it is drawn
    const inner = faces(rails)
      .filter(({ p }) => p.every((q) => Math.abs(q[0] - edge) < 1e-9))
      .flatMap(({ p }) => p);
    expect(Math.min(...inner.map((q) => q[2]))).toBeCloseTo(-3, 6);
    expect(Math.max(...inner.map((q) => q[2]))).toBeCloseTo(1.6 - r, 6);
    expect(1.6 - r).toBeGreaterThanOrEqual(KIND_RADIUS[BALL]);
  });

  it('turns its corners rounded where they stand out, and square where the grass meets it in a corner', () => {
    const { round: r } = RAIL;
    for (const [name, map, out, into] of [
      // the first hole's outer corner, off the course, and its inner corner at the foot of the course
      ['Straight', COURSES[0].holes[0].map, [0, 0], [1, 1]],
      // the dog-leg's elbow, which juts into the course where the ball can meet it, and its far corner
      ['Dog-leg', COURSES[0].holes[1].map, [6, 10], [14, 13]],
    ] as const) {
      const l = layoutOf(map);
      const rails = railsOf(l, 1.6, 3);
      const points = faces(rails).flatMap(({ p }) => p);
      const [ox, oy] = [l.originX + out[0] * TILE, l.originY + out[1] * TILE];
      // cut off on a round: nothing nearer the corner than the round leaves, and something on the round between the
      // two sides, a round in from each of them
      const near = Math.min(...points.map((q) => Math.hypot(q[0] - ox, q[1] - oy)));
      expect(near, `${name}: the corner is rounded off`).toBeGreaterThanOrEqual(r * (Math.SQRT2 - 1) - 1e-6);
      const [mx, my] = [l.cols / 2 > out[0] ? ox + r : ox - r, l.rows / 2 > out[1] ? oy + r : oy - r];
      const round = points.filter((q) => {
        const [u, v] = [Math.abs(q[0] - ox), Math.abs(q[1] - oy)];
        return u > 1e-6 && v > 1e-6 && u < r - 1e-6 && v < r - 1e-6 && q[2] < 0;
      });
      expect(round.length, `${name}: the corner's round`).toBeGreaterThan(0);
      for (const q of round) expect(Math.hypot(q[0] - mx, q[1] - my), `${name}: on the round`).toBeCloseTo(r, 5);
      const [ix, iy] = [l.originX + into[0] * TILE, l.originY + into[1] * TILE];
      expect(
        points.some((q) => Math.hypot(q[0] - ix, q[1] - iy) < 1e-9),
        `${name}: the grass's corner is filled`,
      ).toBe(true);
    }
  });

  it('is smooth where it is round, and sharp only at its corners, its foot and its steps', () => {
    for (const [name, l, leftOut] of [
      ...everyRail(),
      ['a rail beside a step', layoutOf(STEPPED), new Set<number>()] as const,
      ['a rail beside a step, across it', layoutOf(STEPPED_ALONG), new Set<number>()] as const,
    ]) {
      const rails = railsOf(l, 1.6, 3, leftOut);
      const all = faces(rails);
      // every face turned the way its corners' normals say, and every normal a direction
      for (const { p, n } of all) {
        const g = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
        for (const m of n) {
          expect(Math.abs(Math.hypot(...m) - 1), `${name}: a unit normal`).toBeLessThan(1e-6);
          expect(dot(g, m), `${name}: wound as its normal faces`).toBeGreaterThan(0.5);
        }
      }
      // where two faces meet along an edge, they either share its normals, which is smooth, or meet at a real corner
      // of forty-five degrees or more; the round's corners in the grass's corner are points where two sides meet
      const byEdge = new Map<string, { g: V3; at: Map<string, V3> }[]>();
      for (const { p, n } of all) {
        const g = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
        const at = new Map(p.map((q, k) => [key(q), n[k]]));
        for (let k = 0; k < 3; k++) {
          const e = [key(p[k]), key(p[(k + 1) % 3])].sort().join('|');
          byEdge.set(e, [...(byEdge.get(e) ?? []), { g, at }]);
        }
      }
      const onGrid = (k: string) => {
        const [x, y] = k.split(',').map((v) => +v / 1e3);
        const [u, v] = [(x - l.originX) / TILE, (y - l.originY) / TILE];
        return Math.abs(u - Math.round(u)) < 1e-6 && Math.abs(v - Math.round(v)) < 1e-6;
      };
      let smooth = 0;
      for (const [e, pair] of byEdge) {
        if (pair.length !== 2) continue;
        const [f, h] = pair;
        const corner = dot(f.g, h.g) < Math.cos(Math.PI / 4);
        for (const end of e.split('|')) {
          if (corner || onGrid(end)) continue;
          expect(dot(f.at.get(end)!, h.at.get(end)!), `${name}: a crease in what is round, at ${end}`).toBeGreaterThan(
            0.9999,
          );
          if (dot(f.g, h.g) < 0.9999) smooth++;
        }
      }
      // and there is something round in it, shaded smooth where its faces turn
      expect(smooth, name).toBeGreaterThan(0);
    }
  });

  it('wears a cap along its top in a colour of its own, down over the round and a little of its sides', () => {
    expect(RAIL.cap).toBeGreaterThan(RAIL.round);
    const l = layoutOf(COURSES[0].holes[0].map);
    const rails = railsOf(l, 1.6, 3);
    const line = 1.6 - RAIL.cap;
    const zs = (mesh: Mesh) => Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs(rails.cap))).toBeCloseTo(line, 6);
    expect(Math.max(...zs(rails.cap))).toBeCloseTo(1.6, 6);
    expect(Math.max(...zs(rails.sides))).toBeCloseTo(line, 6);
    expect(Math.min(...zs(rails.sides))).toBeCloseTo(-3, 6);
  });

  it('keeps each tile of it within its triangle budget, on every hole', () => {
    for (const [name, l, leftOut] of everyRail()) {
      const count = new Map<number, number>();
      for (const { p } of faces(railsOf(l, 1.6, 3, leftOut))) {
        const mx = (p[0][0] + p[1][0] + p[2][0]) / 3,
          my = (p[0][1] + p[1][1] + p[2][1]) / 3;
        const t = Math.floor((my - l.originY) / TILE) * l.cols + Math.floor((mx - l.originX) / TILE);
        count.set(t, (count.get(t) ?? 0) + 1);
      }
      expect(Math.max(...count.values()), name).toBeLessThanOrEqual(BUDGET.rail);
    }
  });
});

describe('the grass round the cup', () => {
  it('meets the ground without a seam, level or on a slope: the same corners, heights and normals', () => {
    for (const [name, l] of [
      ['Straight', layoutOf(COURSES[0].holes[0].map)],
      ...COURSES[1].holes.map((h) => [h.name, layoutOf(h.map, h.terrain)] as const),
    ] as const) {
      const { z, height } = cupGround(l);
      expect(z, name).toBeCloseTo(heightAt(l, l.cup.x, l.cup.y), 9);
      const grass = collar(TILE, CUP.radius, { height, pieces: GROUND.pieces }).parts[0].mesh;
      const ground = groundOf(l);
      const x0 = l.cup.x - TILE / 2,
        y0 = l.cup.y - TILE / 2;
      const onEdge = (x: number, y: number) =>
        [x0, x0 + TILE].some((e) => Math.abs(x - e) < 1e-9) || [y0, y0 + TILE].some((e) => Math.abs(y - e) < 1e-9);
      /** Every corner of a mesh on the edge of the cup's tile, where the ground and the collar meet, with its normal. */
      const edge = (mesh: Mesh, dx: number, dy: number, dz: number) => {
        const out = new Map<string, V3>();
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const [x, y, zz] = [mesh.positions[i] + dx, mesh.positions[i + 1] + dy, mesh.positions[i + 2] + dz];
          if (x < x0 - 1e-9 || x > x0 + TILE + 1e-9 || y < y0 - 1e-9 || y > y0 + TILE + 1e-9 || !onEdge(x, y)) continue;
          out.set(key([x, y, zz]), [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]);
        }
        return out;
      };
      const round = edge(grass, l.cup.x, l.cup.y, z);
      const green = new Map([...edge(ground.green, 0, 0, 0), ...edge(ground.mown, 0, 0, 0)]);
      expect(green.size, name).toBeGreaterThan(0);
      // every corner of the green round the cup's tile is a corner of the collar, at the same height, facing the same way
      for (const [k, n] of green) {
        expect(round.has(k), `${name}: the collar has the ground's corner ${k}`).toBe(true);
        // as near the same as a normal kept in single precision can be
        expect(dot(round.get(k)!, n), `${name}: and its normal`).toBeGreaterThan(1 - 1e-6);
      }
      // and the collar has no corner on its edge that the ground's grass beside it does not
      for (const k of round.keys()) expect(green.has(k), `${name}: a corner of the collar alone, ${k}`).toBe(true);
    }
  });
});

describe('the earth round a pond', () => {
  // a pond two tiles across and two down; sand beside it on its east side; the rest grass
  const POND = ['#######', '#..C..#', '#.....#', '#.~~..#', '#.~~s.#', '#..T..#', '#######'];
  /** The area of a triangle in space. */
  const area3 = ([a, b, c]: V3[]) => Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;

  it('stands on every edge where grass or sand meets water, down from the ground to the water’s surface, and on no other', () => {
    const l = layoutOf(POND);
    const earth = triangles(groundOf(l).banks);
    expect(earth.length).toBeGreaterThan(0);
    // every corner of the earth is at the ground or at the water: a wall, plumb
    for (const tri of earth)
      for (const p of tri)
        expect(
          [0, WATER_LEVEL].some((z) => Math.abs(p[2] - z) < 1e-6),
          `at height ${p[2]}`,
        ).toBe(true);
    // its area is the length of the edges that face water, times how far the water lies below
    let edges = 0;
    for (let ty = 0; ty < l.rows; ty++)
      for (let tx = 0; tx < l.cols; tx++) {
        const t = ty * l.cols + tx;
        if (l.solid[t] || l.water[t]) continue;
        for (const [ox, oy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (l.water[(ty + oy) * l.cols + tx + ox]) edges++;
      }
    // the cup's own tile is left to its collar, and is not beside the water here
    expect(edges, 'a two by two pond has eight edges').toBe(8);
    const total = earth.reduce((a, tri) => a + area3(tri), 0);
    expect(total).toBeCloseTo(edges * TILE * -WATER_LEVEL, 4);
  });

  it('comes down from the sand’s edge too, so there is no gap between a bunker and the water', () => {
    const l = layoutOf(POND);
    const eastEdge = l.originX + 4 * TILE;
    const walls = triangles(groundOf(l).banks).filter((tri) => tri.every((p) => Math.abs(p[0] - eastEdge) < 1e-6));
    expect(walls.length, 'the wall between the sand and the water').toBeGreaterThan(0);
    // and it is at the sand's own row, the fourth from the top of seven
    const rowSouth = l.originY + 2 * TILE;
    for (const tri of walls) for (const p of tri) expect(p[1]).toBeGreaterThanOrEqual(rowSouth - 1e-6);
  });

  it('comes down from a raised step as far as the water, the whole of the step and the drop', () => {
    const l = layoutOf(['#######', '#..C..#', '#.....#', '#.~2..#', '#.~~..#', '#..T..#', '#######']);
    const step = STEP * 2;
    // the step's west face, between the water and the step, on the line between column 2 and column 3
    const line = l.originX + 3 * TILE;
    const walls = triangles(groundOf(l).banks).filter((tri) => tri.every((p) => Math.abs(p[0] - line) < 1e-6));
    expect(walls.length).toBeGreaterThan(0);
    const tops = walls.flatMap((tri) => tri.map((p) => p[2]));
    expect(Math.max(...tops)).toBeCloseTo(step, 5);
    expect(Math.min(...tops)).toBeCloseTo(WATER_LEVEL, 5);
  });
});
