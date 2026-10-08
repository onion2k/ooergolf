/**
 * The grass of a golf hole: long blades in the rough a ball is played from, inside the stakes, and nothing past them, where
 * the ball is lost and nobody plays. And what is pressed flat round a ball that lies in the rough, so it is seen and not
 * lost among the blades. A hole of minigolf is the field it always was, which `turf.test.ts` holds to a hash.
 */
import { describe, expect, it } from 'vitest';
import { MAX_TRAMPLE, checkField, grassGround } from 'artshape-render/game/grass';
import { heightAt, layoutOf, TILE, tileAt } from '../src/arena';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { dress, scatter } from '../src/scenery';
import {
  FAIRWAY,
  FLATTEN,
  GRASS,
  KINDS,
  ROUGH,
  cellFor,
  fieldOf,
  flattenFor,
  grassOptionsOf,
  trampleOf,
} from '../src/turf';
import { CHECKER, mownAt } from '../src/ground';
import { KIND_RADIUS } from '../src/arena';
import { PALETTE } from '../src/models/palette';
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
      if (r === 8 && c >= 11 && c <= 19) return 'c';
      if (r === ROWS - 4) return c === 15 ? 'T' : c === 14 || c === 16 ? 't' : 'f';
      if (c >= 12 && c <= 18) return 'f';
      // the first cut, a tile wide along the fairway's two edges and across the green's foot
      if (r >= 8 && (c === 11 || c === 19)) return 'c';
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

  it('grows nothing on the green, the tee, the first cut or the cup, or in sand or water: they are mown flat or are not grass', () => {
    for (const [what, r, c] of [
      ['the green', 5, 14],
      ['the first cut', 30, 11],
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

  it('grows the fairway its own short grass, in every cell of every fairway tile and in no other', () => {
    for (const [r, c] of [
      [30, 15],
      [30, 12],
      [30, 18],
      [12, 14],
      [ROWS - 5, 16],
    ]) {
      const p = tile(r, c);
      expect(layout.lie[tileAt(layout, p.x, p.y)], `row ${r} column ${c} is fairway`).toBe(LIE.fairway);
      for (const [dx, dy] of [
        [-1.4, -1.4],
        [1.4, 1.4],
        [-1.4, 1.4],
        [1.4, -1.4],
        [0, 0],
      ])
        expect(grown(field, p.x + dx, p.y + dy).kind, `row ${r} column ${c}`).toBe(FAIRWAY + 1);
    }
    expect(field.kinds.length).toBe(2);
    expect(FAIRWAY).not.toBe(ROUGH);
    // the fairway stands on the ground it lies on, as the rough does
    const p = tile(30, 15);
    expect(grown(field, p.x, p.y).height).toBeCloseTo(heightAt(layout, p.x, p.y), 0);
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
    // every cell that grows anything is on a tile of the rough or the fairway, each its own kind, and no other
    let grows = 0;
    for (let cy = 0; cy < field.rows; cy++)
      for (let cx = 0; cx < field.cols; cx++) {
        if (!field.mask[cy * field.cols + cx]) continue;
        grows++;
        const t = tileAt(layout, field.origin[0] + (cx + 0.5) * field.cell, field.origin[1] + (cy + 0.5) * field.cell);
        expect(t, 'on the hole').toBeGreaterThanOrEqual(0);
        expect(layout.lie[t], 'a tile of rough or fairway').toBe(
          field.mask[cy * field.cols + cx] === ROUGH + 1 ? LIE.rough : LIE.fairway,
        );
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
        fairway = 0,
        elsewhere = 0;
      for (let cy = 0; cy < f.rows; cy += 3)
        for (let cx = 0; cx < f.cols; cx += 3) {
          const m = f.mask[cy * f.cols + cx];
          if (!m) continue;
          const t = tileAt(l, f.origin[0] + (cx + 0.5) * f.cell, f.origin[1] + (cy + 0.5) * f.cell);
          const clear = t >= 0 && !l.oob[t] && !l.sand[t] && !l.water[t];
          if (clear && m === ROUGH + 1 && l.lie[t] === LIE.rough) rough++;
          else if (clear && m === FAIRWAY + 1 && l.lie[t] === LIE.fairway) fairway++;
          else elsewhere++;
        }
      expect(rough, hl.name).toBeGreaterThan(500);
      expect(fairway, hl.name).toBeGreaterThan(100);
      expect(elsewhere, hl.name).toBe(0);
    }
  });
});

describe('the first cut of a golf hole', () => {
  it('grows no blade: it is mown flat like the green it fringes, and painted, so the putting surface and its edge read as one', () => {
    for (const [r, c] of [
      [30, 11],
      [30, 19],
      [8, 14],
      [8, 11],
    ]) {
      const p = tile(r, c);
      expect(layout.lie[tileAt(layout, p.x, p.y)]).toBe(LIE.cut);
      expect(grown(field, p.x, p.y).kind, `row ${r} column ${c}`).toBe(0);
    }
    // while the rough beside it still does
    const rough = tile(30, 10);
    expect(grown(field, rough.x, rough.y).kind).toBeGreaterThan(0);
  });

  it('leaves exactly as many cells of grass as the tiles of rough and fairway say, so none of the cut is counted among them', () => {
    let cells = 0;
    for (const k of field.mask) if (k) cells++;
    let tiles = 0;
    for (let t = 0; t < layout.cols * layout.rows; t++)
      if (
        (layout.lie[t] === LIE.rough || layout.lie[t] === LIE.fairway) &&
        !layout.oob[t] &&
        !layout.sand[t] &&
        !layout.water[t] &&
        !layout.solid[t]
      )
        tiles++;
    const per = (TILE / field.cell) ** 2;
    expect(cells).toBe(tiles * per);
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

  it('is none where nothing grows to be seen through, or only grass shorter than the ball: on the fairway, the green, the tee, in sand, out of bounds', () => {
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

  it('is none on the first cut, which is mown and has no blades to lose a ball in', () => {
    for (const [r, c] of [
      [30, 11],
      [30, 19],
      [8, 15],
    ]) {
      const p = lie(r, c);
      expect(layout.lie[tileAt(layout, p.x, p.y)], `row ${r} column ${c} is cut`).toBe(LIE.cut);
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

describe('the kinds of grass of a golf hole', () => {
  const rough = field.kinds[ROUGH],
    fairway = field.kinds[FAIRWAY];
  const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('grows the fairway short, as the mown grass it is: a quarter of the rough at the most, and under the ball’s middle at its tallest', () => {
    expect(fairway.height).toBeLessThanOrEqual(rough.height / 4);
    expect(fairway.height * (1 + (fairway.heightSpread ?? 0.3)), 'a ball lies in it and is seen').toBeLessThan(
      KIND_RADIUS[0] / 2,
    );
  });

  it('is dense, in the rough and in the fairway: eighty blades a square unit or more, the rough the one minigolf has, and the fairway the denser', () => {
    expect(rough.density).toBeGreaterThanOrEqual(80);
    expect(rough.density, 'one rough on every course').toBe(KINDS[ROUGH].density);
    expect(fairway.density, 'a short blade needs more of them to cover the ground').toBeGreaterThan(rough.density);
  });

  it('keeps the rough as it was but for how many blades there are, and the fairway not mown to stand up in the wind', () => {
    expect({ ...rough, density: 0 }).toEqual({ ...KINDS[ROUGH], density: 0 });
    expect(fairway.give, 'stiffer than long grass').toBeLessThan(rough.give ?? 1);
  });

  it('colours the fairway lighter and yellower than the rough, and as the green it is painted: the blades average to the painted fairway', () => {
    const ground = grassGround(fairway),
      rough_ = grassGround(rough);
    expect(luminance(ground), 'lighter').toBeGreaterThan(luminance(rough_) * 2);
    // the rough is a blue-green, the fairway a yellow-green: how much of the red there is against the blue
    expect(ground[0] / ground[2], 'yellower').toBeGreaterThan((rough_[0] / rough_[2]) * 2);
    // the painted fairway is the game's green in its two stripes, an eighth either side of the middle
    for (let c = 0; c < 3; c++)
      expect(ground[c], `channel ${c}`).toBeCloseTo((PALETTE.grass[c] + PALETTE.grassMown[c]) / 2, 2);
  });

  it("grows the fairway unstriped over ground mown in a checker, which the renderer's stripes cannot follow, in its middle green", () => {
    expect(fairway.stripes, 'the fairway is not striped').toBeUndefined();
    expect(rough.stripes, 'the rough is not mown').toBeUndefined();
    // the painted fairway's two tones are an eighth either side of the green the blades average to
    expect(mownAt(layout, 0, 0)).not.toBe(mownAt(layout, CHECKER.golf, 0));
    expect(mownAt(layout, 0, 0)).toBe(mownAt(layout, CHECKER.golf, CHECKER.golf));
  });

  it('is a field the renderer takes on a hole too big for the finest cell, where a chunk holds fewer blades, with both densities in what it holds', () => {
    const cols = 340,
      rows = 340;
    const map = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
        if (r === rows - 3 && c === 170) return 'T';
        if (r === 2 && c === 170) return 'C';
        return c > 100 && c < 240 ? 'f' : 'r';
      }).join(''),
    );
    const big = layoutOf(map);
    expect(cellFor(big)).toBe(1.5);
    const f = fieldOf(big, 'big golf');
    expect(() => checkField(f, grassOptionsOf(big))).not.toThrow();
    expect(
      f.kinds.map((k) => k.density),
      'not thinned for the cell',
    ).toEqual([rough.density, fairway.density]);
  });

  it('is the turf minigolf has on a hole of minigolf: one kind, eighty blades, 1.2 tall, and the rings are the same', () => {
    const mini = layoutOf(COURSES[0].holes[0].map);
    const f = fieldOf(mini, COURSES[0].holes[0].name);
    expect(f.kinds).toEqual([KINDS[ROUGH]]);
    expect(KINDS[ROUGH].density).toBe(80);
    expect(KINDS[ROUGH].height).toBe(1.2);
    expect(grassOptionsOf(mini)).toEqual(GRASS);
  });
});

describe('the turf figures chosen on 4 October 2026 (candidate B of the sheet)', () => {
  it('holds both kinds to them, so a retune is a deliberate change and not a drift', () => {
    const pick = (k: {
      density: number;
      height: number;
      heightSpread?: number;
      variation?: number;
      lean?: number;
    }) => ({
      density: k.density,
      height: k.height,
      heightSpread: k.heightSpread,
      variation: k.variation,
      lean: k.lean,
    });
    expect(pick(KINDS[ROUGH])).toEqual({ density: 80, height: 1.2, heightSpread: 0.5, variation: 0.45, lean: 0.45 });
    expect(pick(field.kinds[ROUGH])).toEqual(pick(KINDS[ROUGH]));
    expect(pick(field.kinds[FAIRWAY])).toEqual({
      density: 100,
      height: 0.3,
      heightSpread: 0.3,
      variation: 0.2,
      lean: 0.35,
    });
  });
});
