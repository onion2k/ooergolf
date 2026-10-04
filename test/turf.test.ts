/** A hole's grass as the renderer grows it: the rough round the course, and no blade on the course, whose green is painted. */
import { createHash } from 'node:crypto';
import { MAX_BEND, MAX_SIDE, bend, checkField, gust, levels } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, tileAt } from '../src/arena';
import { COURSE, COURSES, type HoleDef } from '../src/course';
import { HILLS } from './hills';
import { ROUGH_DEPTH } from '../src/scene';
import { SAMPLE_HOLES } from './helpers';
import { clearings } from '../src/scenery';
import { BLADE_ROOM, CELLS, FIELD_SIDE, GRASS, KINDS, ROUGH, TURF, cellFor, fieldOf, windOf } from '../src/turf';

const HOLE: HoleDef = {
  name: 'test turf',
  par: 3,
  map: ['#########', '#...C...#', '#.......#', '#~~~11..#', '#.......#', '#...T...#', '#########'],
  obstacles: [{ kind: 'conveyor', from: [6, 4], to: [6, 2], speed: 4 }],
};

/** The kind that grows at a point, 0 for none, and the height it stands at. */
function at(field: ReturnType<typeof fieldOf>, x: number, y: number) {
  const cx = Math.floor((x - field.origin[0]) / field.cell),
    cy = Math.floor((y - field.origin[1]) / field.cell);
  const i = cy * field.cols + cx;
  return { kind: field.mask[i], height: field.heights[i] };
}

describe('the turf of a hole', () => {
  const l = layoutOf(HOLE.map);
  const field = fieldOf(l, HOLE.name);

  it('is a field the renderer takes, within its ceilings, round the whole course and the rough beyond', () => {
    expect(() => checkField(field)).not.toThrow();
    expect(field.cols).toBeLessThanOrEqual(1024);
    expect(field.rows).toBeLessThanOrEqual(1024);
    expect(field.origin[0]).toBeLessThanOrEqual(l.originX - TURF.reach + 1e-9);
    expect(field.kinds.length).toBe(KINDS.length);
    expect(field.outside).toEqual({ kind: ROUGH, height: -ROUGH_DEPTH });
  });

  it('grows the rough off the course, down where it lies, and past the field as far as is seen', () => {
    expect(at(field, l.originX - 5, l.originY - 5)).toEqual({ kind: ROUGH + 1, height: -ROUGH_DEPTH });
    expect(KINDS, 'the rough is the only grass').toEqual([KINDS[ROUGH]]);
    expect(KINDS[ROUGH].stripes, 'the rough is not mown').toBeUndefined();
  });

  it('grows no blade on the course, on any hole of minigolf: the green is painted, and the rough frames it', () => {
    // a hole of golf grows its rough inside the stakes and nothing past them: `golf-turf.test.ts` holds that
    for (const hole of SAMPLE_HOLES.filter((h) => !layoutOf(h.map, h.terrain).golf)) {
      const hl = layoutOf(hole.map, hole.terrain);
      const f = fieldOf(hl, hole.name);
      let rough = 0;
      for (let i = 0; i < f.mask.length; i++) {
        const x = f.origin[0] + ((i % f.cols) + 0.5) * f.cell,
          y = f.origin[1] + (Math.floor(i / f.cols) + 0.5) * f.cell;
        const t = tileAt(hl, x, y);
        // on the course is any tile but the rock round it; the rail stands on the course's edge
        const course = t >= 0 && (!hl.solid[t] || hl.rail[t] === 1);
        if (course) expect(f.mask[i], `${hole.name}: a blade on the course at ${x},${y}`).toBe(0);
        else if (f.mask[i] === ROUGH + 1) rough++;
      }
      // a hole that fills its rail's box, a golf hole a hundred yards wide and three hundred long, is half course and
      // half the rough that frames it: what matters is that all of the margin is rough, which the test of a field's
      // edge below holds cell by cell, and that it is a good deal of the field
      expect(rough, `${hole.name}: the rough round it`).toBeGreaterThan(f.mask.length * 0.4);
    }
  });

  it('grows no blade in a clearing, and grows the rough up to its edge and all round it, so a rock is seen and not seen through blades', () => {
    const bare = [
      { x: l.originX - 6, y: l.originY - 4, r: 2 },
      { x: l.originX + 20, y: l.originY + 25, r: 1.2 },
    ];
    const cleared = fieldOf(l, HOLE.name, bare);
    expect(() => checkField(cleared)).not.toThrow();
    for (const c of bare) {
      expect(at(cleared, c.x, c.y).kind, 'bare at its middle').toBe(0);
      expect(at(cleared, c.x + c.r * 0.9, c.y).kind, 'bare inside its edge').toBe(0);
      expect(at(cleared, c.x, c.y - c.r * 0.9).kind, 'bare inside its edge, the other way').toBe(0);
      expect(at(cleared, c.x + c.r + 0.5, c.y).kind, 'rough past it').toBe(ROUGH + 1);
      expect(at(cleared, c.x, c.y + c.r + 0.5).kind, 'rough past it, the other way').toBe(ROUGH + 1);
    }
    // nothing else changed: the same field but for the clearings' cells
    let changed = 0;
    for (let i = 0; i < field.mask.length; i++) if (field.mask[i] !== cleared.mask[i]) changed++;
    const area = bare.reduce((a, c) => a + Math.PI * c.r * c.r, 0) / (TURF.cell * TURF.cell);
    expect(changed).toBeGreaterThan(area * 0.9);
    expect(changed).toBeLessThan(area * 1.15);
    expect(fieldOf(l, HOLE.name, []), 'no clearings, no change').toEqual(field);
  });

  it('is the same for a hole every time, and every hole of the course is one the renderer takes', () => {
    expect(fieldOf(l, HOLE.name)).toEqual(field);
    for (const hole of COURSE) {
      const hl = layoutOf(hole.map);
      expect(() => checkField(fieldOf(hl, hole.name)), hole.name).not.toThrow();
    }
  });
});

describe('the rough as turf, short and dense', () => {
  const rough = KINDS[ROUGH];

  it('has blades at least a unit tall, at the tallest still lower than the green they frame', () => {
    expect(rough.height).toBeGreaterThanOrEqual(1.0);
    // a blade stands from the rough's floor, ROUGH_DEPTH below the green: it must not reach up over the course's level
    expect(rough.height * (1 + (rough.heightSpread ?? 0.3))).toBeLessThan(ROUGH_DEPTH);
  });

  it('has seventy-two blades or more to the square unit, as many as a chunk of the field can hold', () => {
    expect(rough.density).toBeGreaterThanOrEqual(72);
    expect(() => checkField(fieldOf(layoutOf(HOLE.map), HOLE.name), GRASS)).not.toThrow();
  });

  it("is thinned with distance in rings of the game's own, from where the camera stands, and not by the renderer's default", () => {
    const { near, mid, far } = levels(fieldOf(layoutOf(HOLE.map), HOLE.name), GRASS);
    // the renderer's own rings scale with the blade's height, and at this height would keep every blade a hundred units out
    const dflt = levels(fieldOf(layoutOf(HOLE.map), HOLE.name));
    expect(near, 'thinner, from nearer').toBeLessThan(dflt.near);
    // the closest the camera stands to the ground is 30 units; the grass under it is whole
    expect(near).toBeGreaterThanOrEqual(30);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    // what is drawn at each zoom, on every hole, against the renderer's capacity, is held on the GPU in smoke/game.spec.ts
    expect(GRASS.capacity, 'the game names its room for blades, which the test on the GPU holds the scenes to').toBe(
      BLADE_ROOM,
    );
  });
});

describe('the wind of a hole', () => {
  it('blows its own way on each hole, strongly enough to move long grass, the same every time', () => {
    const winds = COURSE.map((h) => windOf(h.name));
    expect(windOf(COURSE[0].name)).toEqual(winds[0]);
    expect(new Set(winds.map((w) => w.direction.map((d) => d.toFixed(3)).join())).size).toBeGreaterThan(3);
    for (const w of winds) {
      expect(Math.hypot(...w.direction)).toBeCloseTo(1, 6);
      expect(w.strength).toBeGreaterThanOrEqual(0.7);
      expect(w.strength).toBeLessThanOrEqual(1);
    }
  });

  it('bends the grass a good way, across the ground at one moment and at one place over a few seconds, on every hole', () => {
    const give = KINDS[ROUGH].give ?? 1;
    for (const hole of COURSES.flatMap((c) => c.holes)) {
      const w = windOf(hole.name);
      // across a sixteen-unit window: the ripples, the most of them over a spread of moments
      let across = 0;
      for (let t = 0; t < 20; t += 1.7) {
        let lo = Infinity,
          hi = -Infinity;
        for (let x = 0; x < 16; x += 0.5)
          for (let y = 0; y < 16; y += 0.5) {
            const b = bend(give, w, x, y, t, 0);
            lo = Math.min(lo, b);
            hi = Math.max(hi, b);
          }
        across = Math.max(across, hi - lo);
      }
      expect(across, `${hole.name}: ripples across the ground, in radians`).toBeGreaterThanOrEqual(0.4);
      // at one place, a blade of its own phase, over six seconds: the sway
      let lo = Infinity,
        hi = -Infinity;
      for (let t = 0; t < 6; t += 0.05) {
        const b = bend(give, w, 5, 5, t, 0.3);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
      expect(hi - lo, `${hole.name}: sway at a place, in radians`).toBeGreaterThanOrEqual(0.3);
      // the wind alone leaves a blade room to lean and be pressed: the renderer holds the sum to MAX_BEND
      expect(hi, `${hole.name}: never bent past the most`).toBeLessThan(MAX_BEND);
    }
  });

  it("gusts in ripples a few units across, which cross the ground downwind at the wind's speed", () => {
    for (const hole of COURSE) {
      const w = windOf(hole.name);
      expect(w.gustSize, 'ripples, not swells the whole view is under').toBeLessThanOrEqual(10);
      expect(w.gustSpeed, 'and carried across at a pace the eye follows').toBeGreaterThanOrEqual(4);
      // the flow: what is here now is, a moment later, where the wind has carried it
      for (const [x, y, t] of [
        [3, 4, 0],
        [-7, 2.5, 5.1],
        [11, -6, 9.7],
      ]) {
        const dt = 0.8;
        const dx = w.direction[0] * w.gustSpeed * dt,
          dy = w.direction[1] * w.gustSpeed * dt;
        expect(gust(x + dx, y + dy, w, t + dt)).toBeCloseTo(gust(x, y, w, t), 4);
      }
    }
  });

  it('gusts across the hole with time, as the renderer blows the grass', () => {
    const w = windOf(COURSE[0].name);
    const g = [0, 1, 2, 3].map((t) => gust(0, 0, w, t));
    expect(new Set(g.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });
});

/**
 * The grass of a hole too big for the finest cell. The field is a texture the renderer limits to `MAX_SIDE` cells a
 * side, and the finest cell, a quarter of a unit, covers a hole of sixty tiles across and no more; a coarser cell covers
 * a bigger one, since all the field says is where the course is (in whole tiles) and where a rock has cleared the
 * rough, and past its edge the renderer grows the same rough on its own. Every hole that exists keeps the finest.
 */
describe('the grass of a big hole', () => {
  /** An open green `cols` tiles across and `rows` long inside a rail, the tee and the cup on it. */
  const open = (cols: number, rows: number) =>
    layoutOf(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (r === rows - 3 && c === Math.floor(cols / 4)) return 'T';
          if (r === 2 && c === Math.floor((cols * 3) / 4)) return 'C';
          return '.';
        }).join(''),
      ),
    );

  /** The fields of every hole that exists, made as the page makes them, hashed: written from the game before any coarser cell was. */
  const GOLDEN = '29be30e09d95e421af49f0a82732bb8dd8d8130baeff1291ff9ac46f29aae2bf';
  /**
   * The holes the golden was written from, in the order it was: the Meadow but for the windmill and the mill race, which
   * were drawn again so that the cup shows, and the four slope holes the tests keep (the four The Hills had first, which
   * were on the course until it was scrapped). The five Downs that were hashed beside them went with their course.
   */
  const ORIGINAL = [
    ...COURSE.filter((h) => !['Windmill', 'The Mill Race'].includes(h.name)),
    ...['The Hollow', 'The Volcano', 'The Bowl', 'Side-hill'].map((n) => HILLS.find((h) => h.name === n)!),
  ];
  /** Every hand-drawn hole added since: held to the finest cell and to being made the same each time, not to a hash. */
  const ADDED = [...COURSE, ...HILLS].filter((h) => !ORIGINAL.includes(h));

  it('is the very field every hole that existed had, bit for bit, at the finest cell', () => {
    const all = createHash('sha256');
    let holes = 0;
    for (const hole of ORIGINAL) {
      const layout = layoutOf(hole.map, hole.terrain);
      expect(cellFor(layout), hole.name).toBe(TURF.cell);
      const f = fieldOf(layout, hole.name, clearings(layout, hole.name));
      const h = createHash('sha256');
      h.update(JSON.stringify([f.origin, f.cell, f.cols, f.rows, f.seed, f.outside, f.kinds.length]));
      h.update(Buffer.from(f.mask.buffer, f.mask.byteOffset, f.mask.byteLength));
      h.update(Buffer.from(f.heights.buffer, f.heights.byteOffset, f.heights.byteLength));
      all.update(h.digest());
      holes++;
    }
    expect(holes).toBe(11);
    expect(all.digest('hex'), 'the hand-drawn holes').toBe(GOLDEN);
  });

  it('grows the field of every hole added since at the finest cell, the same each time', () => {
    for (const hole of ADDED) {
      const layout = layoutOf(hole.map, hole.terrain);
      expect(cellFor(layout), hole.name).toBe(TURF.cell);
      const make = () => fieldOf(layout, hole.name, clearings(layout, hole.name));
      const [a, b] = [make(), make()];
      expect(Buffer.from(a.mask.buffer).equals(Buffer.from(b.mask.buffer)), `${hole.name}: mask`).toBe(true);
      expect(Buffer.from(a.heights.buffer).equals(Buffer.from(b.heights.buffer)), `${hole.name}: heights`).toBe(true);
    }
  });

  it('takes the finest cell whose field the renderer takes: finer for a smaller hole, and none for one past the last', () => {
    expect(FIELD_SIDE, 'the renderer’s own limit').toBe(MAX_SIDE);
    expect(CELLS[0], 'the finest is the one the holes had').toBe(TURF.cell);
    for (const cell of CELLS)
      expect(TILE / cell, `${cell} goes a whole number of times into a tile`).toBe(Math.round(TILE / cell));
    // sixty by sixty-eight, two hundred, three hundred and four hundred tiles: each needs the next cell down
    expect(cellFor(open(60, 60))).toBe(0.25);
    expect(cellFor(open(60, 68))).toBe(0.5);
    expect(cellFor(open(200, 200))).toBe(0.75);
    expect(cellFor(open(300, 300))).toBe(1);
    expect(cellFor(open(400, 400))).toBe(1.5);
    // each cell's last hole and the first past it: a field of exactly the limit is taken, and one more cell is not
    for (const [tiles, cell] of [
      [62, 0.25],
      [63, 0.5],
      [148, 0.5],
      [149, 0.75],
      [233, 0.75],
      [234, 1],
      [318, 1],
      [319, 1.5],
    ] as const)
      expect(cellFor(open(tiles, 40)), `${tiles} tiles across`).toBe(cell);
    // the biggest hole a field covers, and one tile more is refused, and by name
    expect(cellFor(open(489, 489))).toBe(1.5);
    expect(() => cellFor(open(490, 400))).toThrow(/490 by 400 tiles.*at most 489/);
    expect(() => fieldOf(open(400, 500), 'too big')).toThrow(RangeError);
  });

  it('is a field the renderer takes, at every cell there is', () => {
    for (const [cols, rows] of [
      [60, 68],
      [200, 200],
      [300, 300],
      [400, 400],
      [489, 489],
    ]) {
      const layout = open(cols, rows);
      const f = fieldOf(layout, 'big', clearings(layout, 'big'));
      expect(() => checkField(f, GRASS), `${cols} by ${rows}`).not.toThrow();
      expect(f.cols).toBeLessThanOrEqual(MAX_SIDE);
      expect(f.rows).toBeLessThanOrEqual(MAX_SIDE);
      expect(f.cell).toBe(cellFor(layout));
      expect(f.outside, 'the rough goes on past it').toEqual({ kind: ROUGH, height: -ROUGH_DEPTH });
    }
  });

  it('keeps the course’s edge exact at every cell: each cell is wholly on the course or wholly off it, and grows nothing on it', () => {
    for (const [cols, rows] of [
      [60, 68],
      [200, 200],
      [300, 300],
      [400, 400],
    ]) {
      const layout = open(cols, rows);
      const f = fieldOf(layout, 'edge');
      const inset = 1e-6;
      let on = 0,
        off = 0;
      for (let cy = 0; cy < f.rows; cy++)
        for (let cx = 0; cx < f.cols; cx++) {
          const x0 = f.origin[0] + cx * f.cell,
            y0 = f.origin[1] + cy * f.cell;
          const course = [
            [f.cell / 2, f.cell / 2],
            [inset, inset],
            [f.cell - inset, inset],
            [inset, f.cell - inset],
            [f.cell - inset, f.cell - inset],
          ].map(([dx, dy]) => {
            const t = tileAt(layout, x0 + dx, y0 + dy);
            return t >= 0 && (!layout.solid[t] || layout.rail[t] === 1);
          });
          if (!course.every((c) => c === course[0]))
            throw new Error(`${cols} by ${rows}: cell ${cx},${cy} is on the edge`);
          const mask = f.mask[cy * f.cols + cx];
          if (course[0]) {
            on++;
            if (mask !== 0) throw new Error(`${cols} by ${rows}: a blade on the course at cell ${cx},${cy}`);
          } else {
            off++;
            if (mask !== ROUGH + 1) throw new Error(`${cols} by ${rows}: no rough off the course at cell ${cx},${cy}`);
          }
        }
      expect(on, `${cols} by ${rows}: the course is there`).toBeGreaterThan(0);
      expect(off, `${cols} by ${rows}: and the rough round it`).toBeGreaterThan(0);
    }
  });

  it('clears every cell a rock’s clearing touches at a coarse cell, and grows the rough right up to the ones it does not', () => {
    const layout = open(400, 400);
    const f = fieldOf(layout, 'rocks', [{ x: layout.originX - 10, y: layout.originY - 8, r: 1.4 }]);
    expect(f.cell).toBe(1.5);
    const cellOf = (x: number, y: number) =>
      Math.floor((y - f.origin[1]) / f.cell) * f.cols + Math.floor((x - f.origin[0]) / f.cell);
    // every point of the disc, on a grid a tenth of a unit apart, is in a cell with no rough
    let touched = 0;
    for (let dx = -1.4; dx <= 1.4; dx += 0.1)
      for (let dy = -1.4; dy <= 1.4; dy += 0.1)
        if (Math.hypot(dx, dy) <= 1.4) {
          expect(
            f.mask[cellOf(layout.originX - 10 + dx, layout.originY - 8 + dy)],
            `at ${dx.toFixed(1)},${dy.toFixed(1)}`,
          ).toBe(0);
          touched++;
        }
    expect(touched).toBeGreaterThan(200);
    // and not a cell more than a cell and a half's reach from it
    let cleared = 0;
    for (let i = 0; i < f.mask.length; i++) {
      if (f.mask[i] !== 0) continue;
      const x = f.origin[0] + ((i % f.cols) + 0.5) * f.cell,
        y = f.origin[1] + (Math.floor(i / f.cols) + 0.5) * f.cell;
      const t = tileAt(layout, x, y);
      if (t >= 0 && (!layout.solid[t] || layout.rail[t] === 1)) continue;
      cleared++;
      expect(
        Math.hypot(x - (layout.originX - 10), y - (layout.originY - 8)),
        'no cell far from it is cleared',
      ).toBeLessThan(1.4 + f.cell);
    }
    expect(cleared).toBeGreaterThan(0);
  });
});
