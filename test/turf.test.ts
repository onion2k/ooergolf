/** A hole's grass as the renderer grows it: the rough round the course, and no blade on the course, whose green is painted. */
import { MAX_BEND, bend, checkField, gust, levels } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { layoutOf, tileAt } from '../src/arena';
import { COURSE, COURSES, type HoleDef } from '../src/course';
import { ROUGH_DEPTH } from '../src/scene';
import { BLADE_ROOM, GRASS, KINDS, ROUGH, TURF, fieldOf, windOf } from '../src/turf';

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

describe('the rough as lush, long grass', () => {
  const rough = KINDS[ROUGH];

  it('has blades at least a unit and a half tall, at the tallest still lower than the green they frame', () => {
    expect(rough.height).toBeGreaterThanOrEqual(1.5);
    // a blade stands from the rough's floor, ROUGH_DEPTH below the green: it must not reach up over the course's level
    expect(rough.height * (1 + (rough.heightSpread ?? 0.3))).toBeLessThan(ROUGH_DEPTH);
  });

  it('has thirty-six blades or more to the square unit, as many as a chunk of the field can hold', () => {
    expect(rough.density).toBeGreaterThanOrEqual(36);
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
