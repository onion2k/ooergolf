/** The ground as it is drawn: one mesh over the green that follows its slopes, in its stripes, and earth where it steps down. */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { STEP, TILE, heightAt, layoutOf, terrainAt, type Layout } from '../src/arena';
import { GROUND, groundOf, railsOf } from '../src/ground';

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
    const flat = layoutOf(MAP.map((r) => r.replace(/1/g, '.')));
    expect(triangles(groundOf(flat).banks).length, 'no step, no earth').toBe(0);
  });

  it('is cut fine enough to follow a slope: a few pieces a tile', () => {
    expect(GROUND.pieces).toBe(3);
    const l = layoutOf(MAP);
    expect(triangles(groundOf(l).green).length + triangles(groundOf(l).mown).length).toBe(grassTiles(l) * 2 * 3 * 3);
  });
});

describe('the rail', () => {
  /** Every rail tile's corners as the mesh has them: the highest point of the mesh over each corner. */
  const tops = (mesh: Mesh) => {
    const out = new Map<string, number>();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const key = `${mesh.positions[i].toFixed(3)},${mesh.positions[i + 1].toFixed(3)}`;
      out.set(key, Math.max(out.get(key) ?? -Infinity, mesh.positions[i + 2]));
    }
    return out;
  };

  it('stands a rail height over the step beside it on the flat, its top level, as it always did', () => {
    const l = layoutOf(MAP);
    const rails = railsOf(l, 1.6, 3);
    const heights = new Set([...tops(rails).values()].map((z) => z.toFixed(4)));
    // over level grass all round: this hole's raised step is nowhere beside the rail
    expect([...heights]).toEqual(['1.6000']);
    // and a rail beside a raised step stands over the step, level
    const stepped = layoutOf(MAP.map((r, i) => (i === 7 ? '#1.11...#' : r)));
    const over = new Set([...tops(railsOf(stepped, 1.6, 3)).values()].map((z) => z.toFixed(4)));
    expect([...over].sort()).toEqual(['1.6000', (1.6 + STEP).toFixed(4)].sort());
  });

  it('follows ground that slopes along its top, one tile meeting the next at the same height', () => {
    // a rise across the whole hole, rail and all, down the rows past the cup's level ground
    const ACROSS = MAP.map((r, i) =>
      String(['0', '0', '0', '0', '0', '0', '1', '2', '2', '1'][i] ?? '0').repeat(r.length),
    );
    const l = layoutOf(MAP, ACROSS);
    const rails = railsOf(l, 1.6, 3);
    const corners = tops(rails);
    // the west rail's inner corners, down the rows the slope is on: each the slope's height there and a rail's more
    for (let row = 6; row <= 10; row++) {
      const x = l.originX + TILE,
        y = l.originY + (l.rows - row) * TILE;
      const z = corners.get(`${x.toFixed(3)},${y.toFixed(3)}`)!;
      expect(z, `row ${row}`).toBeGreaterThanOrEqual(terrainAt(l, x, y) + 1.6 - 1e-4);
    }
    // somewhere it is not level: the slope shows in it
    const west = [...corners.entries()].filter(([k]) => Math.abs(+k.split(',')[0] - (l.originX + TILE)) < 1e-3);
    expect(new Set(west.map(([, z]) => z.toFixed(3))).size).toBeGreaterThan(2);
  });
});
