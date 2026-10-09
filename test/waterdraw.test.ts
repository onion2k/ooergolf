/**
 * A hole's ponds as the title picture draws them: the smooth curve of their tiles, cut to the tiles that are water, with
 * a low rocky shelf where a water tile lies outside the curve, and a ring of small lumpy stones along the edge, standing
 * in the water tiles. The ring is scenery only and spends no chance, so each rule here is about the map and the mesh.
 */
import { describe, expect, it } from 'vitest';
import { TILE, WATER_LEVEL, layoutOf, tileAt, type Layout } from '../src/arena';
import { COURSES, type HoleDef } from '../src/course';
import { OCEAN, bankStone } from '../src/models';
import { SHELF, STONE_RING, TOUCH, pondOf, waterEdgeOf, type Pond } from '../src/waterdraw';

/** Every hole of every course, as the layout the game draws, with the pond it makes. */
const HOLES = COURSES.flatMap((c) => c.holes).map((hole: HoleDef) => {
  const layout = layoutOf(hole.map, hole.terrain);
  return { name: hole.name, layout, pond: pondOf(layout) };
});
const WET = HOLES.filter((h) => h.layout.water.some((w) => w));

/** The triangles of a stone of each kind, found by counting the model's own. */
const STONE_TRIANGLES = [0, 1, 2].map((k) => bankStone(k).parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0));

/** A rectangle of water with ground all round it. */
const POND = layoutOf(['#########', '#.......#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#...T.C.#', '#########']);

const wet = (l: Layout, x: number, y: number) => {
  const t = tileAt(l, x, y);
  return t >= 0 && l.water[t] === 1;
};

/** How far a point is from the nearest side of a water tile that meets ground, found here and not by the code under test. */
function fromBank(l: Layout, x: number, y: number): number {
  const tx = Math.floor((x - l.originX) / TILE),
    ty = Math.floor((y - l.originY) / TILE);
  const ground = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < l.cols && r < l.rows && !l.water[r * l.cols + c] && !l.solid[r * l.cols + c];
  const x0 = l.originX + tx * TILE,
    y0 = l.originY + ty * TILE;
  let m = Infinity;
  if (ground(tx, ty - 1)) m = Math.min(m, y - y0);
  if (ground(tx + 1, ty)) m = Math.min(m, x0 + TILE - x);
  if (ground(tx, ty + 1)) m = Math.min(m, y0 + TILE - y);
  if (ground(tx - 1, ty)) m = Math.min(m, x - x0);
  return m;
}

/** Every triangle of a pond's part, as its three corners and its middle in the world. */
function* trianglesOf(l: Layout, mesh: Pond['parts'][number]['mesh']) {
  const p = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => {
      const i = mesh.indices[t + k] * 3;
      return { x: p[i] + l.originX, y: p[i + 1] + l.originY, z: p[i + 2] };
    });
    yield {
      v,
      cx: (v[0].x + v[1].x + v[2].x) / 3,
      cy: (v[0].y + v[1].y + v[2].y) / 3,
    };
  }
}

describe('the water drawn', () => {
  it('is the open water of the mock: a deeper, more saturated blue under a tint of sky, with fainter glints', () => {
    expect([...OCEAN.body]).toEqual([...bodyOf(0.02, 0.38, 0.86)]);
    expect([...OCEAN.tint]).toEqual([...bodyOf(0.4, 0.8, 0.97)]);
    expect(OCEAN.tilt).toBe(0.3);
    expect(OCEAN.scale).toBe(0.6);
    expect(OCEAN.minigolfScale).toBe(0.6);
  });

  it('is never drawn over a tile that is not water: every triangle of every band stands wholly in water tiles', () => {
    expect(WET.length, 'holes with water').toBeGreaterThan(8);
    let checked = 0;
    for (const { name, layout: l, pond } of WET) {
      const drawn = pond.parts.filter((p) => p.name !== 'shelf');
      expect(drawn.length, `${name}: parts`).toBeGreaterThan(0);
      for (const part of drawn)
        for (const { v, cx, cy } of trianglesOf(l, part.mesh)) {
          checked++;
          expect(wet(l, cx, cy), `${name}: a ${part.name} triangle over ground at ${cx},${cy}`).toBe(true);
          // a corner on a tile's edge is moved a hair toward the middle, to the tile the triangle is in
          for (const c of v)
            expect(
              wet(l, c.x + (cx - c.x) * 1e-3, c.y + (cy - c.y) * 1e-3),
              `${name}: a ${part.name} corner over ground`,
            ).toBe(true);
        }
    }
    expect(checked, 'triangles looked at').toBeGreaterThan(5000);
  });

  it('keeps a shelf 0.18 above the water on water tiles outside the curve, and nowhere else', () => {
    const shelf = pondOf(POND).parts.find((p) => p.name === 'shelf');
    expect(shelf, 'a rectangle of water has rounded corners, and a shelf in them').toBeDefined();
    const edge = waterEdgeOf(POND)!;
    let n = 0;
    for (const { v, cx, cy } of trianglesOf(POND, shelf!.mesh)) {
      n++;
      expect(wet(POND, cx, cy), 'a shelf on ground').toBe(true);
      for (const c of v) expect(c.z).toBeCloseTo(WATER_LEVEL + SHELF.rise, 6);
      expect(SHELF.rise).toBe(0.18);
      // outside the curve, or at the edge of it, to the interpolation's error (the curve is read between points 0.75 apart)
      expect(edge.depth(cx, cy), 'a shelf inside the water').toBeLessThanOrEqual(0.15);
    }
    expect(n).toBeGreaterThan(0);
    // and every hole's shelf too
    for (const { name, layout: l, pond } of WET)
      for (const part of pond.parts.filter((p) => p.name === 'shelf'))
        for (const { cx, cy } of trianglesOf(l, part.mesh))
          expect(wet(l, cx, cy), `${name}: a shelf on ground`).toBe(true);
  });

  it('puts no shelf in the middle of a pond, and the bands are flat at the water level', () => {
    const l = POND;
    const pond = pondOf(l);
    const middle = { x: l.originX + 4.5 * TILE, y: l.originY + 3.5 * TILE };
    for (const part of pond.parts)
      for (const { cx, cy, v } of trianglesOf(l, part.mesh)) {
        if (part.name === 'shelf')
          expect(Math.hypot(cx - middle.x, cy - middle.y), 'a shelf in the deep').toBeGreaterThan(TILE);
        else for (const c of v) expect(c.z).toBeCloseTo(WATER_LEVEL, 6);
      }
  });

  it('is the same every time, and a hole without water has none', () => {
    const again = pondOf(
      layoutOf(['#########', '#.......#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#...T.C.#', '#########']),
    );
    expect(again.parts.map((p) => [p.name, [...p.mesh.positions]])).toEqual(
      pondOf(POND).parts.map((p) => [p.name, [...p.mesh.positions]]),
    );
    const dry = HOLES.find((h) => !h.layout.water.some((w) => w))!;
    expect(dry.pond.parts).toEqual([]);
    expect(dry.pond.spots).toEqual([]);
    expect(waterEdgeOf(dry.layout)).toBeNull();
  });
});

describe('the ring of stones', () => {
  it('stands in water tiles, on every pond of both kinds of course', () => {
    expect(WET.some((h) => h.layout.golf)).toBe(true);
    expect(WET.some((h) => !h.layout.golf)).toBe(true);
    let n = 0;
    for (const { name, layout: l, pond } of WET) {
      expect(pond.spots.length, `${name}: a ring`).toBeGreaterThan(0);
      for (const s of pond.spots) {
        n++;
        expect(wet(l, s.x, s.y), `${name}: a stone out of the water at ${s.x},${s.y}`).toBe(true);
        // the stone's centre is clear of the bank by most of its radius, so it stands in the water's tile and not over the grass
        expect(fromBank(l, s.x, s.y), `${name}: a stone on the bank`).toBeGreaterThanOrEqual(0.3 * s.r - 1e-9);
      }
    }
    expect(n, 'stones looked at').toBeGreaterThan(1500);
  });

  it('touches a neighbour along an edge: no stone stands alone', () => {
    for (const { name, layout: l, pond } of WET) {
      for (const [i, s] of pond.spots.entries()) {
        const touches = pond.spots.some((o, j) => j !== i && Math.hypot(o.x - s.x, o.y - s.y) <= (o.r + s.r) * TOUCH);
        expect(touches, `${name}: a stone alone at ${s.x.toFixed(2)},${s.y.toFixed(2)} in ${l.cols} by ${l.rows}`).toBe(
          true,
        );
      }
    }
  });

  it('stands no more than a stone’s width from the edge of the water', () => {
    for (const { name, layout: l, pond } of WET) {
      const edge = waterEdgeOf(l)!;
      for (const s of pond.spots) {
        // how far in from the edge the water is drawn to: the curve, and the tile's side where it meets ground
        const depth = Math.min(edge.depth(s.x, s.y), fromBank(l, s.x, s.y));
        expect(depth, `${name}: a stone ${depth.toFixed(2)} in, wide ${(2 * s.r).toFixed(2)}`).toBeLessThanOrEqual(
          2 * s.r + 1e-6,
        );
      }
    }
  });

  it('has its tops a little proud of the bank, and each stone sized as its kind of course has them', () => {
    for (const { name, layout: l, pond } of WET) {
      const sizes = l.golf ? STONE_RING.golf : STONE_RING.minigolf;
      for (const s of pond.spots) {
        expect(s.top - s.bank, `${name}: a top`).toBeGreaterThanOrEqual(-0.05);
        expect(s.top - s.bank, `${name}: a top`).toBeLessThanOrEqual(0.25);
        // the passes pack the biggest first, then smaller to fill the gaps: none bigger than the biggest, none tinier than a pebble
        expect(s.r, `${name}: a stone's size`).toBeLessThanOrEqual(sizes.most + 1e-9);
        expect(s.r, `${name}: a stone's size`).toBeGreaterThanOrEqual(sizes.least * STONE_RING.smallest - 1e-9);
        expect(s.kind).toBeGreaterThanOrEqual(0);
        expect(s.kind).toBeLessThan(STONE_RING.kinds);
        // its middle is where the top is less the stone's own height above its middle
        expect(s.z + s.height).toBeCloseTo(s.top, 6);
      }
    }
  });

  it('is the same for a map every time, and different for another, and spends none of the game’s chance', () => {
    const a = pondOf(
      layoutOf(['#########', '#.......#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#...T.C.#', '#########']),
    );
    const b = pondOf(POND);
    expect(a.spots.length).toBeGreaterThan(10);
    expect(a.spots).toEqual(b.spots);
    const wider = pondOf(
      layoutOf(['##########', '#........#', '#.~~~~~..#', '#.~~~~~..#', '#.~~~~~..#', '#...T.C..#', '##########']),
    );
    expect(wider.spots).not.toEqual(b.spots);
    // twice for one layout is the one answer, kept
    expect(pondOf(POND)).toBe(pondOf(POND));
  });

  it('has a hole’s ring under a ceiling of triangles', () => {
    let worst = 0,
      where = '';
    for (const { name, pond } of WET) {
      const tris = pond.spots.reduce((n, s) => n + STONE_TRIANGLES[s.kind], 0);
      if (tris > worst) {
        worst = tris;
        where = name;
      }
    }
    // measured 9 October 2026 on every hole of every course: the worst is The Isles' Long Water, 14,048, within the ceiling
    expect(worst, `the worst ring is ${where}'s`).toBeLessThanOrEqual(STONE_RING.ceiling);
    expect(worst, 'the ceiling is not slack').toBeGreaterThan(STONE_RING.ceiling * 0.8);
  });

  it('and the water’s own bands under a ceiling too', () => {
    let worst = 0;
    for (const { pond } of WET)
      worst = Math.max(
        worst,
        pond.parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0),
      );
    expect(worst).toBeLessThanOrEqual(STONE_RING.waterCeiling);
    expect(worst, 'the ceiling is not slack').toBeGreaterThan(STONE_RING.waterCeiling * 0.8);
  });

  it('is scenery: the physics is handed no stone', async () => {
    const { makeWorld } = await import('../src/physics');
    const { CUP } = await import('../src/course');
    const { seeded } = await import('../src/random');
    const l = layoutOf(['#########', '#.......#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#...T.C.#', '#########']);
    expect(pondOf(l).spots.length).toBeGreaterThan(0);
    expect(makeWorld(l, CUP, seeded(1)).bumpers.length).toBe(0);
  });
});

/** A colour as the models state them: the sRGB curve undone. */
function bodyOf(r: number, g: number, b: number): number[] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(r), lin(g), lin(b)];
}
