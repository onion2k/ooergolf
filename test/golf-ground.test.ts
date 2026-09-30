/**
 * The ground of a golf hole as it is drawn: one mesh a kind of ground, so the fairway, the rough, the green and the
 * tee are told apart by their colour at a glance, which is what a player picks a club by. A hole of minigolf is drawn
 * as it always was, with no golf meshes at all.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { layoutOf } from '../src/arena';
import { COURSE } from '../src/course';
import { GROUND, groundOf } from '../src/ground';
import { PALETTE } from '../src/scene';

/** How many triangles a mesh has. */
const triangles = (m: Mesh) => m.indices.length / 3;
/** How many triangles a tile of ground is: two to each piece, and pieces a side squared. */
const PER_TILE = 2 * GROUND.pieces * GROUND.pieces;

const MAP = ['#########', '#rrrrrrr#', '#rggCggr#', '#rggggfr#', '#rffffsr#', '#ffffffr#', '#rrtTtrr#', '#########'];

/** How many tiles of each kind the map draws, by its letters, and how many of the two mown stripes each is on. */
function tilesOf(kinds: string) {
  const l = layoutOf(MAP);
  const out = [0, 0];
  MAP.forEach((row, r) => {
    const ty = l.rows - 1 - r;
    for (const c of row) if (kinds.includes(c)) out[Math.floor(ty / 2) % 2]++;
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

describe('the ground of a hole of minigolf', () => {
  it('has no golf meshes: it is drawn exactly as it was', () => {
    for (const hole of COURSE) expect(groundOf(layoutOf(hole.map, hole.terrain)).golf, hole.name).toBeUndefined();
  });
});
