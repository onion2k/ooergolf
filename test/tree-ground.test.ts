/**
 * A tree's crown as a ball meets it, and the ground that rises under it. The game holds a ball to a canopy a ball's
 * radius bigger all round (`insideCanopy`), and that shape was a cone with a sharp rim and a cylinder under its base,
 * wider than the base by a little: so a ball at rest on a hillside 6.5 yards from a trunk and 3.8 yards above its foot,
 * whose sphere clears the rim by a hair, was held to be inside the crown by a tenth (the fuzzer, on The Old Course's The
 * Burn, 14 October 2026). The shape is now the ball's radius round the solid cone: a rounded rim, and an underside no
 * wider than the base. Held here at that lie, at points round the rim and under the base, and on every tree of every
 * course of golf as a ball at rest on the ground round it would meet it.
 */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, TILE, heightAt, layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { OLD_SPECS } from '../src/old';
import { treeOf } from '../src/biome';
import { TREE, hitCanopy, insideCanopy, treeCone } from '../src/trees';
import { DT, golfGame } from './helpers';

const R = KIND_RADIUS[BALL];
const cone = treeCone(0, 0, 0);
/** The tile under a point, or -1 off the map. */
function tileAt(l: ReturnType<typeof layoutOf>, x: number, y: number): number {
  const c = Math.floor((x - l.originX) / TILE),
    r = Math.floor((y - l.originY) / TILE);
  return c < 0 || r < 0 || c >= l.cols || r >= l.rows ? -1 : r * l.cols + c;
}

const golfHoles = COURSES.filter((c) => c.golf).flatMap((c) => c.holes.map((h) => ({ course: c.name, hole: h })));

describe('the crown a ball meets', () => {
  it('is a ball’s radius round the solid cone: flat under the base, no wider than the base, and rounded at the rim', () => {
    // under the base, within it: inside by what the middle is over a radius under the base
    expect(insideCanopy(cone, [3, 0, TREE.base - 0.5], R)).toBeCloseTo(0.5, 6);
    expect(insideCanopy(cone, [3, 0, TREE.base - R - 0.01], R)).toBe(0);
    // out past the rim and under it, where the old cylinder was: a sphere there clears the rim
    expect(insideCanopy(cone, [TREE.radius + 0.9, 0, TREE.base - 0.9], R)).toBe(0);
    // the rim is rounded: a ball whose middle is a radius from it, in any direction, touches
    const a = Math.PI / 4;
    const rim = (d: number): [number, number, number] => [
      TREE.radius + d * Math.cos(a),
      0,
      TREE.base - d * Math.sin(a),
    ];
    expect(insideCanopy(cone, rim(R - 0.1), R)).toBeCloseTo(0.1, 6);
    expect(insideCanopy(cone, rim(R + 0.1), R)).toBe(0);
    // the side is as it was: a radius out along its normal is the surface
    const h = TREE.apex - TREE.base,
      slant = Math.hypot(h, TREE.radius);
    const mid: [number, number, number] = [TREE.radius / 2, 0, TREE.base + h / 2];
    const n = [h / slant, 0, TREE.radius / slant];
    expect(insideCanopy(cone, [mid[0] + n[0] * (R - 0.2), 0, mid[2] + n[2] * (R - 0.2)], R)).toBeCloseTo(0.2, 6);
    expect(insideCanopy(cone, [mid[0] + n[0] * (R + 0.2), 0, mid[2] + n[2] * (R + 0.2)], R)).toBe(0);
    // deep inside, the way out is the nearer face
    expect(insideCanopy(cone, [0, 0, TREE.base + 0.3], R)).toBeCloseTo(R + 0.3, 6);
  });

  it('knocks a ball rising under the base straight down, and one clipping the rim out along the rim’s round', () => {
    const under = hitCanopy(cone, [2, 0, TREE.base - 3], [2, 0, TREE.base + 1], R)!;
    expect(under).toBeTruthy();
    expect([under.nx, under.ny, under.nz]).toEqual([0, 0, -1]);
    // flying level just under the base, out past the rim and in: met at the rim's round, which looks out and down
    const rim = hitCanopy(cone, [TREE.radius + 3, 0, TREE.base - 0.5], [TREE.radius - 3, 0, TREE.base - 0.5], R)!;
    expect(rim).toBeTruthy();
    expect(rim.nx).toBeGreaterThan(0);
    expect(rim.nz).toBeLessThan(0);
    expect(rim.nz).toBeGreaterThan(-1);
    expect(Math.hypot(rim.nx, rim.ny, rim.nz)).toBeCloseTo(1, 6);
  });

  it('holds at the lie the fuzzer found on The Burn: a ball laid at rest there breaks no rule', () => {
    const hole = golfHole(OLD_SPECS[0]);
    expect(hole.name).toBe('The Burn');
    const { game } = golfGame(hole);
    game.place(26.6, -113.91);
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is clear of a ball at rest on the ground anywhere round every tree of every course of golf', () => {
    // a ball at rest has its middle a radius over the ground; sampled every half yard out to a radius past the crown's
    // base round every trunk, the deepest it is inside any crown is within the invariant's tolerance
    let trees = 0,
      deepest = 0,
      where = '';
    for (const { course, hole } of golfHoles) {
      const l = layoutOf(hole.map, hole.terrain, undefined, hole.biome);
      // each biome's tree as it has it: a cactus's own figures, and a hologram's has no trunk and is passed through, so a ball
      // may rest inside its crown and the rule is not asked of it (`tree-ground` is about what a canopy turns); the Moon has none
      const tree = treeOf(l);
      if (tree === null || tree.passes) continue;
      for (const t of l.trees) {
        const c = treeCone(t.x, t.y, heightAt(l, t.x, t.y), tree);
        const reach = tree.radius + R;
        for (let dx = -reach; dx <= reach; dx += 0.5)
          for (let dy = -reach; dy <= reach; dy += 0.5) {
            if (dx * dx + dy * dy > reach * reach || Math.hypot(dx, dy) <= tree.trunk + R) continue;
            const x = t.x + dx,
              y = t.y + dy;
            // only where a ball can rest: not water (lost), rock or the rail, and not out of bounds (lost)
            const tile = tileAt(l, x, y);
            if (tile < 0 || l.water[tile] || l.solid[tile] || l.oob[tile]) continue;
            const depth = insideCanopy(c, [x, y, heightAt(l, x, y) + R], R);
            if (depth > deepest) {
              deepest = depth;
              where = `${course}, ${hole.name}: ${x.toFixed(1)},${y.toFixed(1)} by a trunk at ${t.x},${t.y}`;
            }
          }
        trees++;
      }
    }
    expect(trees, 'trees looked at').toBeGreaterThan(1000);
    expect(deepest, where).toBeLessThanOrEqual(0.05);
  });
});
