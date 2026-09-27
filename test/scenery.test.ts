/** The scenery round a hole: on the rough and never the course, clear of it, spaced, bounded, and the same for a hole every time. */
import { describe, expect, it } from 'vitest';
import { layoutOf, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { SCENERY, scatter } from '../src/scenery';

describe('the scenery', () => {
  for (const hole of COURSE) {
    const l = layoutOf(hole.map);
    const items = scatter(l, hole.name);

    it(`round ${hole.name}: stands on the rough, clear of the grass and the rail, and spaced`, () => {
      expect(items.length).toBeGreaterThanOrEqual(SCENERY.least);
      expect(items.length).toBeLessThanOrEqual(SCENERY.most);
      for (const s of items) {
        // nothing on the course, nor within reach of its edge, where it would stand in the play or over the rail
        for (let a = 0; a < 8; a++) {
          const x = s.x + Math.cos((a / 8) * Math.PI * 2) * SCENERY.clear,
            y = s.y + Math.sin((a / 8) * Math.PI * 2) * SCENERY.clear;
          const t = tileAt(l, x, y);
          expect(
            t < 0 || (l.solid[t] === 1 && l.rail[t] === 0),
            `${s.kind} at ${s.x.toFixed(1)},${s.y.toFixed(1)}`,
          ).toBe(true);
        }
      }
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          expect(Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y)).toBeGreaterThanOrEqual(SCENERY.spacing);
    });
  }

  it('is the same for a hole every time, different from hole to hole, and has something of every kind on a course', () => {
    const l = layoutOf(COURSE[0].map);
    expect(scatter(l, COURSE[0].name)).toEqual(scatter(l, COURSE[0].name));
    expect(scatter(l, 'another name')).not.toEqual(scatter(l, COURSE[0].name));
    const kinds = new Set(COURSE.flatMap((h) => scatter(layoutOf(h.map), h.name).map((s) => s.kind)));
    for (const kind of ['round tree', 'pine', 'hedge', 'flowers', 'rock']) expect(kinds, kind).toContain(kind);
  });

  it('turns and sizes each piece a little, so no two trees are alike', () => {
    const items = scatter(layoutOf(COURSE[1].map), COURSE[1].name);
    expect(new Set(items.map((s) => s.yaw.toFixed(3))).size).toBeGreaterThan(items.length / 2);
    for (const s of items) {
      expect(s.scale).toBeGreaterThanOrEqual(0.8);
      expect(s.scale).toBeLessThanOrEqual(1.25);
    }
  });
});
