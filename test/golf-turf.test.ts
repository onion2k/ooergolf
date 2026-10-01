/**
 * The grass of a golf hole: long blades in the rough a ball is played from, inside the stakes, and nothing past them, where
 * the ball is lost and nobody plays. And what is pressed flat round a ball that lies in the rough, so it is seen and not
 * lost among the blades. A hole of minigolf is the field it always was, which `turf.test.ts` holds to a hash.
 */
import { describe, expect, it } from 'vitest';
import { MAX_TRAMPLE, checkField } from 'artshape-render/game/grass';
import { heightAt, layoutOf, TILE, tileAt } from '../src/arena';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { dress, scatter } from '../src/scenery';
import { FLATTEN, GRASS, ROUGH, cellFor, fieldOf, flattenFor, grassOptionsOf, trampleOf } from '../src/turf';
import { LIE } from '../src/surfaces';

const COLS = 31,
  ROWS = 44;
/**
 * A golf hole with every kind of ground in it: a fairway up the middle, rough either side, out of bounds beyond that and
 * rock beyond that, a green and a tee's box, a bunker and a pond in the rough, trees, all on ground that rises to the north.
 */
function hole() {
  const grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return '#';
      if (c <= 1 || c >= COLS - 2) return ' ';
      if (c <= 5 || c >= COLS - 6) return 'x';
      if (r === 3 && c === 15) return 'C';
      if (r < 8 && c >= 11 && c <= 19) return 'g';
      if (r === ROWS - 4) return c === 15 ? 'T' : c === 14 || c === 16 ? 't' : 'f';
      if (c >= 12 && c <= 18) return 'f';
      if (r === 20 && c === 8) return 's';
      if (r === 22 && c === 9) return '~';
      if (r === 24 && c === 22) return '^';
      return 'r';
    }),
  );
  const terrain = Float32Array.from({ length: COLS * ROWS }, (_, k) => 0.2 * Math.floor(k / COLS));
  return { name: 'A rough hole', par: 4, map: grid.map((r) => r.join('')), terrain };
}
const H = hole();
const layout = layoutOf(H.map, H.terrain);
const field = fieldOf(layout, H.name);
/** The tile at row `r` from the top and column `c`: its middle, in world units. */
const tile = (r: number, c: number) => ({
  x: layout.originX + (c + 0.5) * TILE,
  y: layout.originY + (ROWS - 1 - r + 0.5) * TILE,
});
/** What grows at a point, nought for none, and the height it stands at. */
function grown(f: typeof field, x: number, y: number) {
  const cx = Math.floor((x - f.origin[0]) / f.cell),
    cy = Math.floor((y - f.origin[1]) / f.cell);
  const i = cy * f.cols + cx;
  return { kind: f.mask[i], height: f.heights[i] };
}

describe('the grass of a golf hole', () => {
  it("is a field the renderer takes, as every hole's is", () => {
    expect(() => checkField(field, grassOptionsOf(layout))).not.toThrow();
  });

  it('grows the rough in the rough, inside the stakes, in every cell of it', () => {
    for (const [r, c] of [
      [20, 6],
      [30, 7],
      [30, 10],
      [30, 20],
      [12, 24],
      [37, 8],
    ]) {
      const p = tile(r, c);
      expect(layout.lie[tileAt(layout, p.x, p.y)], `row ${r} column ${c} is rough`).toBe(LIE.rough);
      expect(grown(field, p.x, p.y).kind, `row ${r} column ${c}`).toBe(ROUGH + 1);
    }
    // each cell of a rough tile, its corners and its middle alike, so a ball is never at an edge of the grass
    const p = tile(30, 8);
    for (const [dx, dy] of [
      [-1.4, -1.4],
      [1.4, 1.4],
      [-1.4, 1.4],
      [1.4, -1.4],
      [0, 0],
    ])
      expect(grown(field, p.x + dx, p.y + dy).kind).toBe(ROUGH + 1);
  });

  it('grows nothing where the ball is played from but the rough: not on the fairway, the green, the tee, or in sand or water', () => {
    for (const [what, r, c] of [
      ['the fairway', 30, 15],
      ['the fairway at its edge', 30, 12],
      ['the green', 5, 14],
      ["the tee's box", ROWS - 4, 14],
      ['the tee', ROWS - 4, 15],
      ['the cup', 3, 15],
      ['sand', 20, 8],
      ['water', 22, 9],
    ] as const) {
      const p = tile(r, c);
      expect(grown(field, p.x, p.y).kind, what).toBe(0);
    }
  });

  it('grows nothing past the stakes, where a ball is lost: not on out of bounds, the rock beyond it, the rail, or beyond the hole at all', () => {
    for (const [what, r, c] of [
      ['out of bounds', 20, 3],
      ['out of bounds at the stakes', 20, 5],
      ['rock', 20, 0],
      ['rock', 10, COLS - 1],
      ['the rail', 0, 10],
    ] as const) {
      const p = tile(r, c);
      expect(grown(field, p.x, p.y).kind, what).toBe(0);
    }
    // and none beyond the field's grid, which is all there is of it: nothing grows on to the horizon
    expect(field.outside, 'no grass beyond the hole').toBeUndefined();
    // every cell that grows anything is on a tile of the rough, of which the whole hole has no other
    let grows = 0;
    for (let cy = 0; cy < field.rows; cy++)
      for (let cx = 0; cx < field.cols; cx++) {
        if (!field.mask[cy * field.cols + cx]) continue;
        grows++;
        const t = tileAt(layout, field.origin[0] + (cx + 0.5) * field.cell, field.origin[1] + (cy + 0.5) * field.cell);
        expect(t, 'on the hole').toBeGreaterThanOrEqual(0);
        expect(layout.lie[t], 'a tile of rough').toBe(LIE.rough);
        expect(layout.oob[t] + layout.sand[t] + layout.water[t] + layout.solid[t], 'and nothing else').toBe(0);
      }
    expect(grows, 'a good deal of it').toBeGreaterThan(5000);
  });

  it('stands the blades on the ground, which rises: the height of the ground under each cell', () => {
    for (const [r, c] of [
      [10, 7],
      [30, 22],
      [36, 9],
    ]) {
      const p = tile(r, c);
      const g = grown(field, p.x, p.y);
      expect(g.height, `row ${r}`).toBeCloseTo(heightAt(layout, p.x, p.y), 0);
      // and it is well above the 3 below the course that the rough round a hole of minigolf lies at
      expect(g.height).toBeGreaterThan(0);
    }
    const low = grown(field, tile(36, 9).x, tile(36, 9).y).height,
      high = grown(field, tile(10, 9).x, tile(10, 9).y).height;
    expect(high, 'higher up the hole').toBeGreaterThan(low + 5);
  });

  it('is the same every time, whatever else is on the hole, and honours a clearing in the rough', () => {
    expect(fieldOf(layout, H.name)).toEqual(field);
    const p = tile(30, 8);
    const cleared = fieldOf(layout, H.name, [{ x: p.x, y: p.y, r: 1.5 }]);
    expect(grown(cleared, p.x, p.y).kind).toBe(0);
    expect(grown(cleared, p.x + 3, p.y).kind).toBe(ROUGH + 1);
  });

  it('is a field the renderer takes on every hole of The Links, at the cell a hole of its size needs, with grass only in its rough', () => {
    for (const k of [0, 6]) {
      const hl = golfHole(LINKS_SPECS[k]);
      const l = layoutOf(hl.map, hl.terrain);
      const f = fieldOf(l, hl.name);
      expect(() => checkField(f, grassOptionsOf(l)), hl.name).not.toThrow();
      expect(f.outside, hl.name).toBeUndefined();
      expect(cellFor(l)).toBeGreaterThanOrEqual(0.25);
      let rough = 0,
        elsewhere = 0;
      for (let cy = 0; cy < f.rows; cy += 3)
        for (let cx = 0; cx < f.cols; cx += 3) {
          if (!f.mask[cy * f.cols + cx]) continue;
          const t = tileAt(l, f.origin[0] + (cx + 0.5) * f.cell, f.origin[1] + (cy + 0.5) * f.cell);
          if (t >= 0 && l.lie[t] === LIE.rough && !l.oob[t] && !l.sand[t] && !l.water[t]) rough++;
          else elsewhere++;
        }
      expect(rough, hl.name).toBeGreaterThan(500);
      expect(elsewhere, hl.name).toBe(0);
    }
  });
});

describe('what is scattered round a golf hole', () => {
  it('is nothing: no tree, rock, hedge or flower stands past the stakes, where the course ends, and the bunting round it is as it was', () => {
    expect(scatter(layout, H.name)).toEqual([]);
    const hl = golfHole(LINKS_SPECS[2]);
    expect(scatter(layoutOf(hl.map, hl.terrain), hl.name)).toEqual([]);
    // what dresses the edge of a golf hole is its bunting alone, which marks where it ends: no bed of flowers, no cluster of rock
    const d = dress(layout, H.name);
    expect(d.bunting.length).toBeGreaterThan(0);
    expect(d.beds).toEqual([]);
    expect(d.rocks).toEqual([]);
  });

  it('is what it always was on a hole of minigolf: the scattered pieces, and the beds and rocks of its dressing', () => {
    const hl = COURSES[0].holes[0];
    const l = layoutOf(hl.map, hl.terrain);
    expect(scatter(l, hl.name).length).toBeGreaterThan(20);
    expect(dress(l, hl.name).beds.length).toBeGreaterThan(0);
    expect(dress(l, hl.name).rocks.length).toBeGreaterThan(0);
  });
});

describe('the trample of a golf hole, where the ball can press the grass down', () => {
  it("covers all the ground a ball can lie on, in a grid the renderer takes, no bigger than a ball's grass needs", () => {
    const t = trampleOf(layout)!;
    expect(t).toBeDefined();
    const { minX, minY, maxX, maxY } = layout.bounds;
    expect(t.origin[0]).toBeLessThanOrEqual(minX);
    expect(t.origin[1]).toBeLessThanOrEqual(minY);
    expect(t.origin[0] + t.cols * t.cell).toBeGreaterThanOrEqual(maxX);
    expect(t.origin[1] + t.rows * t.cell).toBeGreaterThanOrEqual(maxY);
    expect(t.cols * t.rows).toBeLessThanOrEqual(MAX_TRAMPLE);
    expect(t.cell, 'fine enough to press a disc of the radius it presses').toBeLessThanOrEqual(FLATTEN.radius / 3);
    expect(t.recovery, 'stands again after a few seconds').toBeGreaterThan(2);
    expect(grassOptionsOf(layout).trample).toEqual(t);
    expect(() => checkField(field, grassOptionsOf(layout))).not.toThrow();
  });

  it('is nothing for a hole of minigolf, which has no rough to press and a ball that leaves no track', () => {
    const mini = layoutOf(COURSES[0].holes[0].map);
    expect(trampleOf(mini)).toBeUndefined();
    expect(grassOptionsOf(mini)).toEqual(GRASS);
  });

  it('is no more than a quarter of a million texels on the biggest hole of The Links, so it costs the renderer next to nothing', () => {
    const hl = golfHole(LINKS_SPECS[6]);
    const t = trampleOf(layoutOf(hl.map, hl.terrain))!;
    expect(t.cols * t.rows).toBeLessThan(450_000);
  });
});

describe('pressing the grass flat round a ball in the rough, so it is seen', () => {
  const lie = (r: number, c: number) => tile(r, c);

  it('is a disc round the ball where it lies at rest in the rough, as wide as a ball is seen in', () => {
    const p = lie(30, 8);
    const f = flattenFor(layout, p.x, p.y, true)!;
    expect(f).not.toBeNull();
    expect([f.x, f.y]).toEqual([p.x, p.y]);
    expect(f.radius).toBe(FLATTEN.radius);
    expect(FLATTEN.radius, 'wider than the ball, a good deal').toBeGreaterThan(2.5);
  });

  it('is none where nothing grows to be seen through: on the fairway, the green, the tee, in sand, out of bounds', () => {
    for (const [r, c] of [
      [30, 15],
      [5, 14],
      [ROWS - 4, 15],
      [20, 8],
      [20, 3],
    ]) {
      const p = lie(r, c);
      expect(flattenFor(layout, p.x, p.y, true), `row ${r} column ${c}`).toBeNull();
    }
  });

  it('is none while the ball is moving, so a ball in flight over the rough tramples nothing', () => {
    const p = lie(30, 8);
    expect(flattenFor(layout, p.x, p.y, false)).toBeNull();
  });

  it('is none on a hole of minigolf, and off the hole', () => {
    const mini = layoutOf(COURSES[0].holes[0].map);
    expect(flattenFor(mini, mini.tee.x, mini.tee.y, true)).toBeNull();
    expect(flattenFor(layout, layout.originX - 50, 0, true)).toBeNull();
  });
});
