/** A hole's grass as the renderer grows it: green on the course, rough round it, and none where grass cannot be. */
import { checkField, gust } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { STEP, TILE, layoutOf, tileAt } from '../src/arena';
import { COURSE, CUP, type HoleDef } from '../src/course';
import { CUP as CUP_LOOK } from '../src/models/course';
import { Obstacles } from '../src/obstacles';
import { ROUGH_DEPTH } from '../src/scene';
import { GREEN, KINDS, ROUGH, TURF, fieldOf, trampleOf, windOf } from '../src/turf';

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
  const field = fieldOf(l, new Obstacles(HOLE.obstacles!, l), HOLE.name);
  const tile = (col: number, row: number) => ({
    x: l.originX + (col + 0.5) * TILE,
    y: l.originY + (l.rows - 1 - row + 0.5) * TILE,
  });

  it('is a field the renderer takes, within its ceilings, round the whole course and the rough beyond', () => {
    expect(() => checkField(field)).not.toThrow();
    expect(field.cols).toBeLessThanOrEqual(1024);
    expect(field.rows).toBeLessThanOrEqual(1024);
    expect(field.origin[0]).toBeLessThanOrEqual(l.originX - TURF.reach + 1e-9);
    expect(field.kinds.length).toBe(KINDS.length);
    expect(field.outside).toEqual({ kind: ROUGH, height: -ROUGH_DEPTH });
  });

  it('grows the green on the course at its height, and the rough off it, below', () => {
    const tee = tile(4, 5);
    expect(at(field, tee.x, tee.y)).toEqual({ kind: GREEN + 1, height: 0 });
    const step = tile(4, 3);
    expect(at(field, step.x, step.y).kind).toBe(GREEN + 1);
    expect(at(field, step.x, step.y).height).toBeCloseTo(STEP, 5);
    expect(at(field, l.originX - 5, l.originY - 5)).toEqual({ kind: ROUGH + 1, height: -ROUGH_DEPTH });
  });

  it('grows nothing on the rail, on water, on a belt, or in the cup', () => {
    const rail = tile(0, 3),
      water = tile(2, 3),
      belt = tile(6, 3);
    expect(at(field, rail.x, rail.y).kind).toBe(0);
    expect(at(field, water.x, water.y).kind).toBe(0);
    expect(at(field, belt.x, belt.y).kind).toBe(0);
    expect(at(field, l.cup.x, l.cup.y).kind).toBe(0);
    expect(at(field, l.cup.x + CUP.radius * 0.9, l.cup.y).kind, 'inside the rim').toBe(0);
    // nor through the gold rim round it, which is lower than the green's blades, all the way round
    const rim = CUP.radius + CUP_LOOK.rim;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const on = at(field, l.cup.x + Math.cos(a) * (rim - 0.05), l.cup.y + Math.sin(a) * (rim - 0.05));
      expect(on.kind, `on the rim at ${k}/16 of the way round`).toBe(0);
      const px = l.cup.x + Math.cos(a) * (rim + 0.3),
        py = l.cup.y + Math.sin(a) * (rim + 0.3);
      // the cup is a tile from the rail, so the way toward it is rail and not green
      if (l.solid[tileAt(l, px, py)]) continue;
      expect(at(field, px, py).kind, `just past it at ${k}/16`).toBe(GREEN + 1);
    }
    // every cell on a rail tile, not only its middle
    for (let i = 0; i < field.mask.length; i++) {
      if (field.mask[i] === 0) continue;
      const x = field.origin[0] + ((i % field.cols) + 0.5) * field.cell,
        y = field.origin[1] + (Math.floor(i / field.cols) + 0.5) * field.cell;
      const t = tileAt(l, x, y);
      if (t >= 0) expect(l.rail[t] === 1 || l.water[t] === 1, `grass on rail or water at ${x},${y}`).toBe(false);
    }
  });

  it('mows the green in the stripes the tiles had, two rows wide, from the first row of the course', () => {
    const stripes = field.kinds[GREEN].stripes!;
    expect(stripes.width).toBe(2 * TILE);
    expect(stripes.angle).toBe(0);
    // the band the renderer works out for the middle of each row, as its shader does, against the tiles' own stripe
    for (let r = 0; r < l.rows; r++) {
      const y = l.originY + (r + 0.5) * TILE;
      const band = Math.floor((y + (stripes.offset ?? 0)) / stripes.width);
      expect(((band % 2) + 2) % 2, `row ${r}`).toBe(Math.floor(r / 2) % 2);
    }
    expect(field.kinds[ROUGH].stripes, 'the rough is not mown').toBeUndefined();
  });

  it('is the same for a hole every time, and every hole of the course is one the renderer takes', () => {
    expect(fieldOf(l, new Obstacles(HOLE.obstacles!, l), HOLE.name)).toEqual(field);
    for (const hole of COURSE) {
      const hl = layoutOf(hole.map);
      expect(
        () => checkField(fieldOf(hl, new Obstacles(hole.obstacles ?? [], hl), hole.name)),
        hole.name,
      ).not.toThrow();
    }
  });

  it('lays a trample over the course, fine enough for the ball, and within the renderer’s ceiling', () => {
    const t = trampleOf(l);
    expect(t.cell).toBeLessThanOrEqual(0.25);
    expect(t.origin[0]).toBeLessThanOrEqual(l.originX);
    expect(t.origin[0] + t.cols * t.cell).toBeGreaterThanOrEqual(l.originX + l.cols * TILE);
    expect(t.cols * t.rows).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe('the wind of a hole', () => {
  it('blows its own way on each hole, gently, the same every time', () => {
    const winds = COURSE.map((h) => windOf(h.name));
    expect(windOf(COURSE[0].name)).toEqual(winds[0]);
    expect(new Set(winds.map((w) => w.direction.map((d) => d.toFixed(3)).join())).size).toBeGreaterThan(3);
    for (const w of winds) {
      expect(Math.hypot(...w.direction)).toBeCloseTo(1, 6);
      expect(w.strength).toBeGreaterThan(0.2);
      expect(w.strength).toBeLessThan(0.8);
    }
  });

  it('gusts across the hole with time, as the renderer blows the grass', () => {
    const w = windOf(COURSE[0].name);
    const g = [0, 1, 2, 3].map((t) => gust(0, 0, w, t));
    expect(new Set(g.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });
});
