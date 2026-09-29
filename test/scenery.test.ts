/** The scenery round a hole: on the rough and never the course, clear of it, spaced, bounded, and the same for a hole every time. */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { DRESSING, ROCK_SIZE, SCENERY, SCALE, clearings, dress, scatter } from '../src/scenery';

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

describe('the dressing of a hole', () => {
  for (const hole of COURSE) {
    const l = layoutOf(hole.map);
    const d = dress(l, hole.name);
    const onRough = (x: number, y: number) => {
      const t = tileAt(l, x, y);
      return t < 0 || (l.solid[t] === 1 && l.rail[t] === 0);
    };

    it(`round ${hole.name}: bunting on three sides, outside the course, strung high enough to be seen over the rail`, () => {
      expect(d.bunting.length).toBe(3);
      for (const b of d.bunting) {
        // both posts and the middle of the string off the course, on the rough
        const c = Math.cos(b.yaw),
          s = Math.sin(b.yaw);
        for (const k of [-0.5, 0, 0.5]) expect(onRough(b.x + c * b.length * k, b.y + s * b.length * k)).toBe(true);
        expect(b.height, 'above the rail, from the rough').toBeGreaterThan(DRESSING.railTop + 2);
      }
    });

    it(`round ${hole.name}: flower beds along the foot of the rail, on the rough`, () => {
      expect(d.beds.length).toBeGreaterThanOrEqual(4);
      for (const bed of d.beds) {
        expect(onRough(bed.x, bed.y), `${bed.x},${bed.y}`).toBe(true);
        // near the rail: a rail tile within a tile and a half
        let near = false;
        for (let a = 0; a < 8; a++) {
          const t = tileAt(
            l,
            bed.x + Math.cos((a / 8) * Math.PI * 2) * TILE,
            bed.y + Math.sin((a / 8) * Math.PI * 2) * TILE,
          );
          if (t >= 0 && l.rail[t] === 1) near = true;
        }
        expect(near, `${bed.x.toFixed(1)},${bed.y.toFixed(1)} beside the rail`).toBe(true);
      }
    });

    it(`round ${hole.name}: rocks in clusters, on the rough, and the scattered trees kept off the bunting`, () => {
      expect(d.rocks.length).toBeGreaterThanOrEqual(4);
      for (const r of d.rocks) {
        expect(onRough(r.x, r.y)).toBe(true);
        // every rock has another of its cluster close by
        expect(d.rocks.some((o) => o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 3)).toBe(true);
      }
      for (const p of scatter(l, hole.name))
        for (const b of d.bunting) {
          const c = Math.cos(b.yaw),
            s = Math.sin(b.yaw);
          const along = (p.x - b.x) * c + (p.y - b.y) * s,
            across = -(p.x - b.x) * s + (p.y - b.y) * c;
          expect(Math.abs(across) > 2 || Math.abs(along) > b.length / 2 + 1, `${p.kind} under the bunting`).toBe(true);
        }
    });
  }

  it('is the same for a hole every time', () => {
    const l = layoutOf(COURSE[2].map);
    expect(dress(l, COURSE[2].name)).toEqual(dress(l, COURSE[2].name));
  });
});

describe('the clearings round the rocks', () => {
  for (const hole of COURSE) {
    it(`on ${hole.name}: a bare patch under every rock, big enough for it, on the rough and nowhere else`, () => {
      const l = layoutOf(hole.map);
      const rocks = [...dress(l, hole.name).rocks, ...scatter(l, hole.name).filter((p) => p.kind === 'rock')];
      const bare = clearings(l, hole.name);
      expect(rocks.length, 'rocks on every hole').toBeGreaterThan(0);
      expect(bare.length, 'a clearing for each').toBe(rocks.length);
      rocks.forEach((rock, i) => {
        expect(bare[i].x).toBe(rock.x);
        expect(bare[i].y).toBe(rock.y);
        // wider than the rock is, or the blades stand over its edge and it is seen through them
        expect(bare[i].r, 'the rock and a margin').toBeGreaterThan(ROCK_SIZE * rock.scale);
        const t = tileAt(l, rock.x, rock.y);
        expect(t < 0 || (l.solid[t] === 1 && l.rail[t] === 0), 'on the rough').toBe(true);
      });
    });
  }

  it('is the same for a hole every time', () => {
    const l = layoutOf(COURSE[0].map);
    expect(clearings(l, COURSE[0].name)).toEqual(clearings(l, COURSE[0].name));
    expect(SCALE.least).toBeGreaterThan(0);
  });
});
