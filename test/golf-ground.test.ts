/**
 * The ground of a golf hole as it is drawn: one mesh a kind of ground, so the fairway, the rough, the green and the
 * tee are told apart by their colour at a glance, which is what a player picks a club by. A hole of minigolf is drawn
 * as it always was, with no golf meshes at all.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, heightAt, layoutOf, tileAt, type Layout } from '../src/arena';
import { COURSE } from '../src/course';
import { groundOf, stakesOf } from '../src/ground';
import { PALETTE } from '../src/scene';
import { zonesOf } from '../src/zones';

/** How many triangles a mesh has. */
const triangles = (m: Mesh) => m.indices.length / 3;
/** The area of a mesh seen from above, in square yards: its triangles' projected areas, added. */
function area(m: Mesh): number {
  let sum = 0;
  const p = m.positions;
  for (let k = 0; k < m.indices.length; k += 3) {
    const [a, b, c] = [m.indices[k] * 3, m.indices[k + 1] * 3, m.indices[k + 2] * 3];
    sum += Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2;
  }
  return sum;
}

/**
 * The share of the triangles of `m` whose middle is not in `zone`: a mesh is the colour of the ground it is laid on. A
 * fragment cut along a curve is cut by the line between its piece's corners, not the curve itself, so a sliver of one may
 * have its middle a hair the other side: a few in a hundred at most, and none well inside.
 */
function allIn(l: Layout, m: Mesh, zone: string): number {
  const zones = zonesOf(l);
  const p = m.positions;
  let wrong = 0;
  for (let k = 0; k < m.indices.length; k += 3) {
    const [a, b, c] = [m.indices[k] * 3, m.indices[k + 1] * 3, m.indices[k + 2] * 3];
    if (zones.at((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3) !== zone) wrong++;
  }
  return wrong / Math.max(1, m.indices.length / 3);
}

/**
 * A hole with a green and a fairway, a tee and rough, each a block big enough for its curve to keep it (a strip of two tiles
 * blurs away): twenty by twenty-two tiles.
 */
const MAP = (() => {
  const grid: string[][] = Array.from({ length: 22 }, (_, r) =>
    Array.from({ length: 20 }, (_, c) => (r === 0 || r === 21 || c === 0 || c === 19 ? '#' : 'r')),
  );
  const draw = (r0: number, r1: number, c0: number, c1: number, ch: string) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = ch;
  };
  draw(2, 6, 6, 13, 'g');
  grid[4][9] = 'C';
  draw(8, 15, 7, 12, 'f');
  draw(18, 19, 8, 11, 't');
  grid[18][9] = 'T';
  return grid.map((row) => row.join(''));
})();
/** The same hole with a first cut a tile wide round its green and down the fairway's west edge. */
const CUT_MAP = [
  '#########',
  '#rrrrrrr#',
  '#rcccccr#',
  '#rcgCgcr#',
  '#rcgggcr#',
  '#rcccccr#',
  '#rcfffcr#',
  '#rcfffcr#',
  '#rrtTtrr#',
  '#########',
];

describe('the ground of a golf hole', () => {
  const l = layoutOf(MAP);
  const g = groundOf(l);

  it('has a mesh for the rough, the green in its stripes, the tee and the fairway, each laid where its zone is', () => {
    expect(g.golf).toBeDefined();
    const golf = g.golf!;
    // a hole this small has only the zones the curves keep: a fairway, a green, a tee, rough and the cut round them
    expect(triangles(golf.rough)).toBeGreaterThan(0);
    expect(triangles(golf.tee)).toBeGreaterThan(0);
    expect(triangles(golf.putting) + triangles(golf.puttingMown)).toBeGreaterThan(0);
    expect(triangles(g.green) + triangles(g.mown)).toBeGreaterThan(0);
    for (const [mesh, zone] of [
      [golf.rough, 'rough'],
      [golf.tee, 'tee'],
      [golf.putting, 'putting'],
      [golf.puttingMown, 'putting'],
      [g.green, 'fairway'],
      [g.mown, 'fairway'],
      [golf.cut, 'cut'],
    ] as const)
      expect(allIn(l, mesh, zone), `share of the ${zone} mesh in another zone`).toBeLessThan(0.02);
  });

  it('lays each tile once: the meshes add up to the ground, the cup’s tile, water and rock aside, with no gap and no overlap', () => {
    const golf = g.golf!;
    const all = [
      g.green,
      g.mown,
      golf.rough,
      golf.putting,
      golf.puttingMown,
      golf.cut,
      golf.tee,
      golf.oob,
      golf.sand,
      golf.sandRaked,
      golf.lip,
    ];
    let ground = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t]) ground++;
    // less the cup’s tile
    expect(all.reduce((sum, m) => sum + area(m), 0)).toBeCloseTo((ground - 1) * TILE * TILE, 3);
  });

  it('is coloured, each kind its own: rough darker than the fairway, the putting green lighter, the tee paler', () => {
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(PALETTE.playRough)).toBeLessThan(lum(PALETTE.grass));
    // each stripe of the putting green is lighter than the fairway’s like stripe
    expect(lum(PALETTE.puttingGreen)).toBeGreaterThan(lum(PALETTE.grass));
    expect(lum(PALETTE.puttingGreenMown)).toBeGreaterThan(lum(PALETTE.grassMown));
    expect(lum(PALETTE.teeBox)).toBeGreaterThan(lum(PALETTE.grass));
    // the two stripes of the green are told apart, as the fairway’s are
    expect(lum(PALETTE.puttingGreenMown)).toBeGreaterThan(lum(PALETTE.puttingGreen));
  });
});

describe('the first cut of a golf hole as it is drawn', () => {
  const l = layoutOf(CUT_MAP);
  const g = groundOf(l);

  it('is a mesh of its own, laid in the band the zones say, and on a hole drawn with no cut as well: the band is outside the curves, not on a tile of the map', () => {
    expect(triangles(g.golf!.cut)).toBeGreaterThan(8);
    // a hole of blocks big enough to keep its curves (the cut map above is too small, its pieces mostly slivers)
    const big = layoutOf(MAP);
    expect(triangles(groundOf(big).golf!.cut)).toBeGreaterThan(8);
    expect(allIn(big, groundOf(big).golf!.cut, 'cut')).toBeLessThan(0.02);
  });

  it('is told apart from the fairway and the green by its colour, between the two: no seam to read as a stripe', () => {
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const fairway = (lum(PALETTE.grass) + lum(PALETTE.grassMown)) / 2;
    const green = (lum(PALETTE.puttingGreen) + lum(PALETTE.puttingGreenMown)) / 2;
    expect(lum(PALETTE.firstCut)).toBeGreaterThan(fairway);
    expect(lum(PALETTE.firstCut)).toBeLessThan(green);
  });

  it('follows the ground it is on, every corner where the ground is, so it meets the green and the fairway without a gap', () => {
    // a hole that rises to the north, a tile of cut between a green and a fairway
    const terrain = Float32Array.from({ length: l.cols * l.rows }, (_, k) => 0.3 * Math.floor(k / l.cols));
    const hill = layoutOf(CUT_MAP, terrain);
    const mesh = groundOf(hill).golf!.cut;
    expect(mesh.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      // a corner on a tile's edge is at the height of the ground there, whichever tile it is drawn for
      // a corner cut out of a piece is laid by the heights of the piece's own four, bilinear: within half a thousandth of a yard here
      expect(z, `vertex ${i / 3}`).toBeCloseTo(heightAt(hill, x, y), 3);
    }
  });
});

describe('the ground of a hole of minigolf', () => {
  it('has no golf meshes: it is drawn exactly as it was', () => {
    for (const hole of COURSE) expect(groundOf(layoutOf(hole.map, hole.terrain)).golf, hole.name).toBeUndefined();
  });
});

describe('the ground out of bounds', () => {
  const map = ['#########', '#xxxxxxx#', '#xxgCgxx#', '#xffffxx#', '#xffffxx#', '#xrrTrrx#', '#xxxxxxx#', '#########'];
  const l = layoutOf(map);
  const g = groundOf(l);

  it('is a mesh of its own, laid where the zone is out of bounds, and is not laid twice', () => {
    expect(triangles(g.golf!.oob)).toBeGreaterThan(50);
    expect(allIn(l, g.golf!.oob, 'oob')).toBeLessThan(0.02);
    // and none of the rough’s: the rough is `r`, and out of bounds is not it, though a ball is played from it as rough
    expect(allIn(l, g.golf!.rough, 'rough')).toBeLessThan(0.02);
  });

  it('is a colour of its own, drier and paler than the rough it is played from', () => {
    // paler by its blue: the rough was darker and redder than the dry grass until 9 October 2026, when the rough was
    // made the title's light green (0.17, 0.35, 0.009) and out of bounds was left as it was (0.15, 0.36, 0.03)
    expect(PALETTE.oobGround[2]).toBeGreaterThan(PALETTE.playRough[2] * 2);
    expect(PALETTE.oobGround[0]).not.toBeCloseTo(PALETTE.playRough[0], 2);
  });
});

describe('the stakes along the line', () => {
  const map = ['#########', '#xxxxxxx#', '#xxgCgxx#', '#xffffxx#', '#xffffxx#', '#xrrTrrx#', '#xxxxxxx#', '#########'];
  const l = layoutOf(map);

  it('stand on the out of bounds curve (the ground out of bounds is drawn and played by), a half tile of out of bounds and of play either side of it', () => {
    const stakes = stakesOf(l);
    expect(stakes.length).toBeGreaterThan(3);
    const zones = zonesOf(l);
    for (const s of stakes) {
      // on the curve itself: a hair either way reads as out of bounds on one side and in play on the other
      let near = false,
        oob = false,
        play = false;
      for (const [dx, dy] of [
        [0.3, 0],
        [-0.3, 0],
        [0, 0.3],
        [0, -0.3],
      ]) {
        const z = zones.at(s.x + dx, s.y + dy);
        if (z === 'oob') oob = true;
        else play = true;
      }
      near = oob && play;
      expect(near, `a stake at ${s.x.toFixed(1)},${s.y.toFixed(1)} is on the line`).toBe(true);
    }
  });

  it('are spaced along the line, no two on the one tile and none nearer than a tile and a bit, and none on a hole with no out of bounds', () => {
    const stakes = stakesOf(l);
    for (let i = 0; i < stakes.length; i++)
      for (let j = i + 1; j < stakes.length; j++)
        expect(
          Math.hypot(stakes[i].x - stakes[j].x, stakes[i].y - stakes[j].y),
          'two stakes close',
        ).toBeGreaterThanOrEqual(4);
    const tiles = stakes.map((s) => tileAt(l, s.x, s.y));
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(stakesOf(layoutOf(['#####', '#gCg#', '#gTg#', '#####']))).toEqual([]);
    for (const hole of COURSE) expect(stakesOf(layoutOf(hole.map, hole.terrain)), hole.name).toEqual([]);
  });

  it('stand on the ground, which on a hole that slopes is as high as the ground there', () => {
    const rows = l.rows,
      cols = l.cols;
    const heights = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = c * 0.2;
    const sloped = layoutOf(map, heights);
    for (const s of stakesOf(sloped)) expect(s.z).toBeCloseTo(heightAt(sloped, s.x, s.y), 6);
  });
});
