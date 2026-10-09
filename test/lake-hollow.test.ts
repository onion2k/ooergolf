/**
 * The hollow cut in the ground past a golf hole where the backdrop's lake lies. The title picture's lake sits in a hollow of its
 * hills; here the hills rose over a level lake and the plane under the hole lay over what was left, so the lake never showed.
 * Held on holes of every golf course: the water is above the ground across the lake, the ground is above the water just past
 * its shore, the hollow has no cliff in it, and the plane under the hole follows it out to its far edge.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf, type Layout } from '../src/arena';
import { LAKE_SHORE, backdropOf, lakeShapeOf } from '../src/backdrop';
import { COURSES } from '../src/course';
import { HOLLOW, groundZOf, planeOf } from '../src/hills';
import { links } from '../src/links';
import { fells } from '../src/fells';
import { isles } from '../src/isles';

const HOLES = [links()[0], links()[2], links()[8], isles()[1], isles()[8], fells()[4]].map((h) => ({
  name: h.name,
  layout: layoutOf(h.map, h.terrain),
}));

/** A point inside the fan: the middle of each of its triangles, and of the shore's points and the fan's middle. */
function inside(l: Layout, name: string): [number, number][] {
  const s = lakeShapeOf(l, name);
  const out: [number, number][] = [];
  for (let j = 0; j < LAKE_SHORE; j++) {
    const ax = s.shore[2 * j],
      ay = s.shore[2 * j + 1],
      bx = s.shore[2 * j + 2],
      by = s.shore[2 * j + 3];
    // a third of the way from the middle to the triangle's far side, and two thirds
    for (const k of [0.3, 0.6])
      out.push([s.middle[0] + ((ax + bx) / 2 - s.middle[0]) * k, s.middle[1] + ((ay + by) / 2 - s.middle[1]) * k]);
  }
  return out;
}

describe('the hollow of the backdrop’s lake', () => {
  for (const { name, layout } of HOLES) {
    const ground = groundZOf(layout, name);
    const lake = ground.lake!;
    const shape = lakeShapeOf(layout, name);

    it(`${name}: the water stands above the ground across the whole of the lake`, () => {
      const pts = inside(layout, name);
      expect(pts.length).toBeGreaterThan(20);
      for (const [x, y] of pts)
        expect(ground(x, y), `${name} at ${x.toFixed(0)}, ${y.toFixed(0)}`).toBeLessThan(lake.level);
      // and the lake the backdrop draws is at that level
      const b = backdropOf(layout, name, ground);
      for (let i = 2; i < b.lake.positions.length; i += 3) expect(b.lake.positions[i]).toBeCloseTo(lake.level, 3);
    });

    it(`${name}: the ground stands above the water just past the shore, rising away from it`, () => {
      let met = 0;
      for (let j = 1; j < LAKE_SHORE; j++) {
        // out from the shore's point, away from the fan's middle
        const x = shape.shore[2 * j],
          y = shape.shore[2 * j + 1];
        const len = Math.hypot(x - shape.middle[0], y - shape.middle[1]);
        const ux = (x - shape.middle[0]) / len,
          uy = (y - shape.middle[1]) / len;
        const near = ground(x + ux * 8, y + uy * 8),
          far = ground(x + ux * HOLLOW.fall, y + uy * HOLLOW.fall);
        expect(near, `${name}: ${j}`).toBeGreaterThan(lake.level);
        expect(far, `${name}: ${j}`).toBeGreaterThanOrEqual(near - 1e-9);
        met++;
      }
      expect(met, 'a check that met no shore passes in silence').toBeGreaterThan(10);
    });

    it(`${name}: no cliff down into it: a yard along any line across the shore never changes the ground by more than two`, () => {
      let most = 0;
      for (let j = 2; j < LAKE_SHORE - 1; j += 3) {
        const x = shape.shore[2 * j],
          y = shape.shore[2 * j + 1];
        const len = Math.hypot(x - shape.middle[0], y - shape.middle[1]);
        const ux = (x - shape.middle[0]) / len,
          uy = (y - shape.middle[1]) / len;
        for (let d = -HOLLOW.inner - 5; d < HOLLOW.fall + 5; d += 1)
          most = Math.max(most, Math.abs(ground(x + ux * (d + 1), y + uy * (d + 1)) - ground(x + ux * d, y + uy * d)));
      }
      expect(most).toBeLessThan(2);
    });

    it(`${name}: the plane under the hole follows the hollow, so the water is not covered`, () => {
      const plane = planeOf(layout, ground, 1500);
      const p = plane.positions;
      const wet: number[] = [];
      for (let i = 0; i < p.length; i += 3) if (lake.weight(p[i], p[i + 1]) === 1) wet.push(p[i + 2]);
      expect(wet.length, 'a plane with no vertex in the lake passes in silence').toBeGreaterThan(5);
      for (const z of wet) expect(z).toBeLessThan(lake.level);
      // and its grid reaches the hollow's far side, past where the grid of the hills ends
      let far = -Infinity;
      for (let i = 0; i < p.length; i += 3) far = Math.max(far, lake.weight(p[i], p[i + 1]) > 0 ? 1 : 0);
      expect(far).toBe(1);
    });
  }

  it('is cut on every golf hole of every course, and is the same each time', () => {
    for (const c of COURSES.filter((c) => c.golf))
      for (const h of c.holes) {
        const l = layoutOf(h.map, h.terrain);
        const a = groundZOf(l, h.name),
          b = groundZOf(l, h.name);
        expect(a.lake, h.name).toBeDefined();
        expect(a.lake!.level, h.name).toBe(b.lake!.level);
        const [x, y] = inside(l, h.name)[1];
        expect(a(x, y), h.name).toBeLessThan(a.lake!.level);
        expect(a(x, y), h.name).toBe(b(x, y));
      }
  });
});
