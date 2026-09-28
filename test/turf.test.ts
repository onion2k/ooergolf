/** A hole's grass as the renderer grows it: the rough round the course, and no blade on the course, whose green is painted. */
import { checkField, gust } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { layoutOf, tileAt } from '../src/arena';
import { COURSE, COURSES, type HoleDef } from '../src/course';
import { ROUGH_DEPTH } from '../src/scene';
import { KINDS, ROUGH, TURF, fieldOf, windOf } from '../src/turf';

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

  it('grows no blade on the course, on any hole of either course: the green is painted, and the rough frames it', () => {
    for (const hole of COURSES.flatMap((c) => c.holes)) {
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
      expect(rough, `${hole.name}: the rough round it`).toBeGreaterThan(f.mask.length / 2);
    }
  });

  it('is the same for a hole every time, and every hole of the course is one the renderer takes', () => {
    expect(fieldOf(l, HOLE.name)).toEqual(field);
    for (const hole of COURSE) {
      const hl = layoutOf(hole.map);
      expect(() => checkField(fieldOf(hl, hole.name)), hole.name).not.toThrow();
    }
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
