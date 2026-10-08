/**
 * The ground of a golf hole as it is drawn: one mesh a kind of ground, so the fairway, the rough, the green and the
 * tee are told apart by their colour at a glance, which is what a player picks a club by. A hole of minigolf is drawn
 * as it always was, with no golf meshes at all.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, heightAt, layoutOf, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { GROUND, groundOf, stakesOf } from '../src/ground';
import { PALETTE } from '../src/scene';
import { LIE } from '../src/surfaces';

/** How many triangles a mesh has. */
const triangles = (m: Mesh) => m.indices.length / 3;
/** How many triangles a tile of ground is: two to each piece, and pieces a side squared. */
const PER_TILE = 2 * GROUND.pieces * GROUND.pieces;

const MAP = ['#########', '#rrrrrrr#', '#rggCggr#', '#rggggfr#', '#rffffsr#', '#ffffffr#', '#rrtTtrr#', '#########'];
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

/**
 * How many tiles of each kind the map draws, by its letters, and how many of each of the mown checker's two tones each is
 * on: squares of four tiles a side on a golf hole, worked out here from the column and the row.
 */
function tilesOf(kinds: string) {
  const l = layoutOf(MAP);
  const out = [0, 0];
  MAP.forEach((row, r) => {
    const ty = l.rows - 1 - r;
    [...row].forEach((c, tx) => {
      if (kinds.includes(c)) out[(Math.floor(tx / 4) + Math.floor(ty / 4)) % 2]++;
    });
  });
  return out;
}

describe('the ground of a golf hole', () => {
  const l = layoutOf(MAP);
  const g = groundOf(l);

  it('has a mesh for the rough, the green in two stripes, and the tee, beside the fairway’s two stripes', () => {
    expect(g.golf).toBeDefined();
    const golf = g.golf!;
    const roughTiles = tilesOf('r').reduce((a, b) => a + b);
    const teeTiles = tilesOf('tT').reduce((a, b) => a + b);
    expect(triangles(golf.rough)).toBe(roughTiles * PER_TILE);
    expect(triangles(golf.tee)).toBe(teeTiles * PER_TILE);
    // the cup’s own tile is its collar’s, not the green’s
    const [greenEven, greenOdd] = tilesOf('g');
    expect(triangles(golf.putting) + triangles(golf.puttingMown)).toBe((greenEven + greenOdd) * PER_TILE);
    const [fairEven, fairOdd] = tilesOf('f');
    expect(triangles(g.green) + triangles(g.mown)).toBe((fairEven + fairOdd) * PER_TILE);
  });

  it('lays each tile once: the meshes add up to the tiles that are grass, the cup’s, sand and rail aside', () => {
    const golf = g.golf!;
    const all =
      triangles(g.green) +
      triangles(g.mown) +
      triangles(golf.rough) +
      triangles(golf.putting) +
      triangles(golf.puttingMown) +
      triangles(golf.cut) +
      triangles(golf.tee);
    let grass = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t] && !l.sand[t]) grass++;
    // less the cup’s tile
    expect(all).toBe((grass - 1) * PER_TILE);
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

  it('is a mesh of its own with a tile of ground for each tile of cut, and none on a hole with no cut', () => {
    let cut = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (l.lie[t] === LIE.cut && !l.solid[t]) cut++;
    expect(cut).toBeGreaterThan(8);
    expect(triangles(g.golf!.cut)).toBe(cut * PER_TILE);
    expect(triangles(groundOf(layoutOf(MAP)).golf!.cut)).toBe(0);
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
      expect(z, `vertex ${i / 3}`).toBeCloseTo(heightAt(hill, x, y), 4);
    }
  });

  it('has the edge of each tile where the next tile of green has its own, so the pieces share their corners', () => {
    const terrain = Float32Array.from({ length: l.cols * l.rows }, (_, k) => 0.3 * Math.floor(k / l.cols));
    const hill = layoutOf(CUT_MAP, terrain);
    const gr = groundOf(hill).golf!;
    const key = (m: Mesh, i: number) =>
      `${m.positions[i].toFixed(3)},${m.positions[i + 1].toFixed(3)},${m.positions[i + 2].toFixed(3)}`;
    const cutCorners = new Set<string>();
    for (let i = 0; i < gr.cut.positions.length; i += 3) cutCorners.add(key(gr.cut, i));
    let shared = 0;
    for (const m of [gr.putting, gr.puttingMown])
      for (let i = 0; i < m.positions.length; i += 3) if (cutCorners.has(key(m, i))) shared++;
    expect(shared, 'the green and the cut meet along an edge, at the same corners').toBeGreaterThan(5);
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

  it('is a mesh of its own, a tile of it a tile of out of bounds, and is not laid twice', () => {
    let oob = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (l.oob[t]) oob++;
    expect(oob).toBeGreaterThan(10);
    expect(triangles(g.golf!.oob)).toBe(oob * PER_TILE);
    // and none of the rough’s: the rough is `r`, and out of bounds is not it, though a ball is played from it as rough
    expect(triangles(g.golf!.rough)).toBe(4 * PER_TILE);
  });

  it('is a colour of its own, drier and yellower than the rough it is played from', () => {
    expect(PALETTE.oobGround[0]).toBeGreaterThan(PALETTE.playRough[0]);
    expect(PALETTE.oobGround[1]).not.toBeCloseTo(PALETTE.playRough[1], 2);
  });
});

describe('the stakes along the line', () => {
  const map = ['#########', '#xxxxxxx#', '#xxgCgxx#', '#xffffxx#', '#xffffxx#', '#xrrTrrx#', '#xxxxxxx#', '#########'];
  const l = layoutOf(map);

  it('stand on out of bounds, on the side of the line that faces in bounds, and never in play', () => {
    const stakes = stakesOf(l);
    expect(stakes.length).toBeGreaterThan(3);
    for (const s of stakes) {
      const t = tileAt(l, s.x, s.y);
      expect(l.oob[t], `a stake at ${s.x.toFixed(1)},${s.y.toFixed(1)} is on out of bounds`).toBe(1);
      // within a tile of a tile that is in play
      let near = false;
      for (const [dx, dy] of [
        [TILE, 0],
        [-TILE, 0],
        [0, TILE],
        [0, -TILE],
      ]) {
        const u = tileAt(l, s.x + dx, s.y + dy);
        if (u >= 0 && !l.oob[u] && !l.solid[u]) near = true;
      }
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
