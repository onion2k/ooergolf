/**
 * The banks seen from the play camera: the rough and out of bounds of a golf hole coloured by the height of the ground over
 * the nearest ground a ball is played from, and shaded where it bends. Held to what the user chose on 9 October 2026 (the
 * mock's "medium" with creases), to its being smooth (the mock's seven bands showed as stairs), to its being on golf alone,
 * and to its costing nothing a frame: it is made when a hole begins.
 */
import { describe, expect, it } from 'vitest';
import { TILE, heightAt, layoutOf, tileAt, type Layout } from '../src/arena';
import { COURSES } from '../src/course';
import { PALETTE } from '../src/models/palette';
import { Scene } from '../src/scene';
import { zonesOf } from '../src/zones';
import { groundOf } from '../src/ground';
import { splitByTint } from '../src/tintmesh';
import {
  BANK_TINT,
  baseOf,
  bendAt,
  kindOfLevel,
  levelOf,
  riseTint,
  stepOf,
  tintOf,
  tinted,
  valueOf,
  valueOfStep,
} from '../src/tint';
import { KINDS, ROUGH, fieldOf } from '../src/turf';

const hole = (course: string, i: number) => {
  const h = COURSES.find((c) => c.name === course)!.holes[i];
  return { h, layout: layoutOf(h.map, h.terrain) };
};
const links1 = hole('The Links', 0);
const isles2 = hole('The Isles', 1);

/** The points of rough (the zone a ball is played from there as rough) on a grid of `step` yards across a hole, with how high each stands over the play ground nearest it. */
function roughPoints(l: Layout, step = 2) {
  const base = baseOf(l),
    zones = zonesOf(l),
    out: { x: number; y: number; over: number }[] = [];
  for (let y = l.bounds.minY; y < l.bounds.maxY; y += step)
    for (let x = l.bounds.minX; x < l.bounds.maxX; x += step) {
      const t = tileAt(l, x, y);
      if (t < 0 || l.solid[t] || l.water[t] || zones.at(x, y) !== 'rough' || Number.isNaN(base[t])) continue;
      out.push({ x, y, over: heightAt(l, x, y) - base[t] });
    }
  return out;
}

/** The light of a linear colour, and how red it is against green: warmer is higher. */
const light = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const warmth = (c: readonly number[]) => c[0] / c[1];

describe('the tint is on golf alone', () => {
  it('is none on a hole of minigolf, and a field on a golf hole', () => {
    const meadow = layoutOf(COURSES[0].holes[0].map);
    expect(tintOf(meadow)).toBeNull();
    expect(tintOf(links1.layout)).not.toBeNull();
  });
  it('is made once for a hole, so nothing is worked out a frame', () => {
    const a = tintOf(links1.layout)!;
    expect(tintOf(links1.layout)).toBe(a);
  });
});

describe('the tint rises with the height over the nearest ground a ball is played from', () => {
  it('is darker and cooler at nought, itself at a half and lighter and warmer at the top, by the figures the user chose', () => {
    expect(riseTint(0)).toBeCloseTo(-0.6);
    expect(riseTint(BANK_TINT.over / 2)).toBeCloseTo(0);
    expect(riseTint(BANK_TINT.over)).toBeCloseTo(0.6);
    expect(riseTint(100)).toBeCloseTo(0.6);
    const c = PALETTE.playRough;
    const valley = tinted(c, -0.6),
      crest = tinted(c, 0.6);
    // about 30% darker in the valley, about 36% of the way to the yellow-green on the crest
    expect(valley[0] / c[0]).toBeCloseTo(0.7);
    expect(valley[1] / c[1]).toBeCloseTo(0.76);
    expect(valley[2] / c[2]).toBeCloseTo(0.94);
    expect(crest[0]).toBeCloseTo(c[0] + (0.4 - c[0]) * 0.36);
    expect(crest[1]).toBeCloseTo(c[1] + (0.56 - c[1]) * 0.36);
    expect(crest[2]).toBeCloseTo(c[2] + (0.02 - c[2]) * 0.36);
    expect(tinted(c, 0)).toEqual([...c]);
    expect(light(crest)).toBeGreaterThan(light(c));
    expect(light(valley)).toBeLessThan(light(c));
    expect(warmth(crest)).toBeGreaterThan(warmth(c));
    expect(warmth(valley)).toBeLessThan(warmth(c));
  });

  for (const [name, { layout }] of [
    ['The Links 1', links1],
    ['The Isles 2', isles2],
  ] as const) {
    it(`on ${name}: the field is higher where the rough stands higher, and its crest is lighter and warmer than its foot`, () => {
      const tint = tintOf(layout)!;
      const points = roughPoints(layout);
      expect(points.length, 'the rough sampled').toBeGreaterThan(500);
      const sorted = [...points].sort((a, b) => a.over - b.over);
      const mean = (ps: typeof points) => ps.reduce((s, p) => s + tint.at(p.x, p.y), 0) / ps.length;
      const fifth = Math.floor(sorted.length / 5);
      const foot = mean(sorted.slice(0, fifth)),
        crest = mean(sorted.slice(-fifth));
      expect(sorted.at(-1)!.over, 'a bank to speak of').toBeGreaterThan(BANK_TINT.over);
      expect(crest - foot, 'the highest fifth of the rough against the lowest').toBeGreaterThan(0.6);
      // the colours at the extremes: the highest point of the rough and the lowest (over the play ground, the rough's own foot)
      const top = sorted.at(-1)!,
        bottom = sorted[0];
      const high = tinted(PALETTE.playRough, tint.at(top.x, top.y)),
        low = tinted(PALETTE.playRough, tint.at(bottom.x, bottom.y));
      expect(light(high)).toBeGreaterThan(light(low));
      expect(warmth(high)).toBeGreaterThan(warmth(low));
    });
  }
});

describe('the tint meets the plain ground beyond the hole in one colour', () => {
  for (const [name, { layout }] of [
    ['The Links 1', links1],
    ['The Isles 2', isles2],
  ] as const) {
    it(`on ${name}: the field is nought along the hole's edge and comes back to it over ${BANK_TINT.fade} yards`, () => {
      const tint = tintOf(layout)!;
      // the edge of the map, which reaches past the grass: the box the hole's tiles stand in
      const [minX, maxX, minY, maxY] = [
        layout.originX,
        layout.originX + layout.cols * TILE,
        layout.originY,
        layout.originY + layout.rows * TILE,
      ];
      let inner = 0;
      for (let k = 0; k <= 40; k++) {
        const x = minX + ((maxX - minX) * k) / 40,
          y = minY + ((maxY - minY) * k) / 40;
        for (const [px, py] of [
          [x, minY],
          [x, maxY],
          [minX, y],
          [maxX, y],
        ])
          expect(Math.abs(tint.at(px, py)), `the edge at ${px.toFixed(0)}, ${py.toFixed(0)}`).toBeLessThan(0.05);
        // and well inside, over a full fade's width from it, the field is the ground's own: somewhere it is not nought
        inner += Math.abs(tint.at(x, (minY + maxY) / 2)) > 0.2 ? 1 : 0;
      }
      expect(inner, 'the middle of the hole is tinted').toBeGreaterThan(0);
      expect(Math.abs(tint.at(minX - 50, minY - 50)), 'off the hole').toBe(0);
    });
  }
});

describe('the creases follow the ground’s curvature', () => {
  for (const [name, { layout }] of [
    ['The Links 1', links1],
    ['The Isles 2', isles2],
  ] as const) {
    it(`on ${name}: a bend's foot is darkened and its crest lightened, the field there against the field without the bend`, () => {
      const tint = tintOf(layout)!;
      const points = roughPoints(layout, 1.5).map((p) => ({ ...p, bend: bendAt(layout, p.x, p.y) }));
      const foot = points.filter((p) => p.bend < -0.9),
        crest = points.filter((p) => p.bend > 0.9);
      expect(foot.length, 'concave points').toBeGreaterThan(20);
      expect(crest.length, 'convex points').toBeGreaterThan(20);
      // the field is the height's tint plus the crease, then smoothed over a texel: read against the height's alone, the foot is lower and the crest higher
      const over = (p: { over: number }) => riseTint(p.over);
      const mean = (ps: typeof points, f: (p: (typeof points)[0]) => number) =>
        ps.reduce((s, p) => s + f(p), 0) / ps.length;
      expect(mean(foot, (p) => tint.at(p.x, p.y) - over(p))).toBeLessThan(-0.15);
      expect(mean(crest, (p) => tint.at(p.x, p.y) - over(p))).toBeGreaterThan(0.15);
    });
  }
  it('is nought on level ground and clamped to a whole crease on a sharp one', () => {
    const flat = hole('The Meadow', 0).layout;
    expect(Math.abs(bendAt(flat, 0, 0))).toBe(0);
    const { layout } = links1;
    const bends = roughPoints(layout, 3).map((p) => bendAt(layout, p.x, p.y));
    expect(Math.min(...bends)).toBe(-1);
    expect(Math.max(...bends)).toBe(1);
  });
});

describe('the tint is smooth, and not a stair', () => {
  it('is a gradient and not seven bands: thousands of values, and a yard seldom moves it by a step of the blades', () => {
    for (const { layout } of [links1, isles2]) {
      const tint = tintOf(layout)!;
      const zones = zonesOf(layout);
      const values = new Set<number>();
      let big = 0,
        worst = 0,
        pairs = 0;
      for (let y = layout.bounds.minY + 3; y < layout.bounds.maxY - 3; y += 1)
        for (let x = layout.bounds.minX + 3; x < layout.bounds.maxX - 3; x += 1) {
          if (zones.at(x, y) !== 'rough' || zones.at(x + 1, y) !== 'rough' || zones.at(x, y + 1) !== 'rough') continue;
          const s = tint.at(x, y);
          values.add(Math.round(s * 1000));
          for (const step of [Math.abs(tint.at(x + 1, y) - s), Math.abs(tint.at(x, y + 1) - s)]) {
            worst = Math.max(worst, step);
            if (step > valueOf(1)) big++;
            pairs++;
          }
        }
      expect(pairs).toBeGreaterThan(1000);
      // the mock cut the field in 7 and every step of it was a jump of a third in a yard; here a bank is a ramp, and only its
      // steepest yards (measured 1.5 to 2% of the rough on these two, the steepest 0.59 at a bank's face) move a third
      expect(values.size, 'distinct values of the field').toBeGreaterThan(1000);
      expect(big / pairs, 'the share of steps of a yard bigger than a step of the blades').toBeLessThan(0.06);
      expect(worst).toBeLessThan(0.7);
    }
  });
  it('is no more than a twentieth of the ground’s own light between one mesh and the next, so the line between two is not seen', () => {
    for (const [c, oob] of [
      [PALETTE.playRough, false],
      [PALETTE.oobGround, true],
    ] as const) {
      for (let k = 1; k < BANK_TINT.steps; k++) {
        const a = tinted(c, valueOfStep(k - 1), oob),
          b = tinted(c, valueOfStep(k), oob);
        expect(Math.abs(light(b) - light(a)) / light(c), `step ${k} light`).toBeLessThan(0.05);
        for (let i = 0; i < 3; i++) expect(Math.abs(b[i] - a[i]) / c[i], `step ${k} channel ${i}`).toBeLessThan(0.08);
      }
      expect(tinted(c, valueOfStep((BANK_TINT.steps - 1) / 2), oob)).toEqual([...c]);
    }
  });
});

describe('the ground divided into a mesh for each step of the field', () => {
  const ground = groundOf(links1.layout).golf!;
  const tint = tintOf(links1.layout)!;
  /** The area of a mesh seen from above, in square yards. */
  const area = (m: { positions: Float32Array; indices: Uint32Array }) => {
    let sum = 0;
    const p = m.positions;
    for (let k = 0; k < m.indices.length; k += 3) {
      const [a, b, c] = [m.indices[k] * 3, m.indices[k + 1] * 3, m.indices[k + 2] * 3];
      sum += Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2;
    }
    return sum;
  };
  for (const which of ['rough', 'oob'] as const) {
    const whole = ground[which];
    const parts = splitByTint(whole, tint);
    it(`${which}: is the same ground, every triangle in one mesh and none laid twice, in as many steps as the field has`, () => {
      expect(parts.length).toBe(BANK_TINT.steps);
      expect(parts.reduce((s, m) => s + m.indices.length, 0)).toBe(whole.indices.length);
      expect(parts.reduce((s, m) => s + area(m), 0) / area(whole)).toBeCloseTo(1, 6);
      expect(parts.filter((m) => m.indices.length).length, 'steps in use').toBeGreaterThanOrEqual(10);
      // a corner shared by the triangles of a step is one vertex of it: no more than the whole had, a step's share of them over
      expect(parts.reduce((s, m) => s + m.positions.length, 0)).toBeLessThan(whole.positions.length * 2.5);
    });
    it(`${which}: puts each triangle in the step the field has at its middle, and the steps run from the darkest to the lightest`, () => {
      let seen = 0;
      for (const [k, m] of parts.entries())
        for (let t = 0; t < m.indices.length; t += 3 * 5) {
          const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
          const mean =
            (tint.at(m.positions[a], m.positions[a + 1]) +
              tint.at(m.positions[b], m.positions[b + 1]) +
              tint.at(m.positions[c], m.positions[c + 1])) /
            3;
          expect(stepOf(mean), `step ${k}`).toBe(k);
          seen++;
        }
      expect(seen).toBeGreaterThan(1000);
    });
    it(`${which}: leaves no crack: the edges left open are exactly the length they were, since no triangle is cut`, () => {
      const open = (ms: { positions: Float32Array; indices: Uint32Array }[]) => {
        const count = new Map<string, number>();
        const ends = new Map<string, [number, number, number, number]>();
        const key = (m: { positions: Float32Array }, v: number) =>
          [0, 1, 2].map((c) => Math.round(m.positions[v * 3 + c] * 1e3)).join(',');
        for (const m of ms)
          for (let k = 0; k < m.indices.length; k += 3)
            for (let e = 0; e < 3; e++) {
              const [va, vb] = [m.indices[k + e], m.indices[k + ((e + 1) % 3)]];
              const a = key(m, va),
                b = key(m, vb);
              const id = a < b ? `${a}|${b}` : `${b}|${a}`;
              count.set(id, (count.get(id) ?? 0) + 1);
              ends.set(id, [
                m.positions[va * 3],
                m.positions[va * 3 + 1],
                m.positions[vb * 3],
                m.positions[vb * 3 + 1],
              ]);
            }
        let length = 0;
        for (const [id, n] of count) {
          if (n !== 1) continue;
          const [ax, ay, bx, by] = ends.get(id)!;
          length += Math.hypot(bx - ax, by - ay);
        }
        return length;
      };
      // the line between two steps' meshes is shared corner for corner, so it is not an open edge of the two together
      expect(open(parts)).toBeCloseTo(open([whole]), 3);
    });
  }
});

describe('the grass follows the tint', () => {
  const field = fieldOf(links1.layout, links1.h.name);
  it('has the rough, the fairway and six steps of the rough: the eight kinds a field may have, the first two as they were', () => {
    expect(field.kinds.length).toBe(8);
    expect(field.kinds[ROUGH].base).toEqual(KINDS[ROUGH].base);
    expect(BANK_TINT.levels * 2 + 2).toBe(8);
    expect(new Set([-3, -2, -1, 0, 1, 2, 3].map(kindOfLevel)).size).toBe(7);
    expect(kindOfLevel(0)).toBe(ROUGH);
    for (const level of [-3, -2, -1, 1, 2, 3]) {
      const k = field.kinds[kindOfLevel(level)];
      expect(k.density).toBe(field.kinds[ROUGH].density);
      const want = tinted(KINDS[ROUGH].base, valueOf(level));
      expect([...k.base]).toEqual(want.slice(0, 3));
    }
  });
  it('grows a lighter kind on the crests than at the feet, cell by cell, by the very field the ground is painted with', () => {
    const tint = tintOf(links1.layout)!;
    let seen = 0;
    for (let cy = 0; cy < field.rows; cy += 3)
      for (let cx = 0; cx < field.cols; cx += 3) {
        const kind = field.mask[cy * field.cols + cx] - 1;
        if (kind < 0 || kind === 1) continue;
        const x = field.origin[0] + (cx + 0.5) * field.cell,
          y = field.origin[1] + (cy + 0.5) * field.cell;
        expect(kind, `cell ${cx},${cy}`).toBe(kindOfLevel(levelOf(tint.at(x, y))));
        seen++;
      }
    expect(seen, 'cells of rough read').toBeGreaterThan(1000);
    const kinds = new Set<number>();
    for (const m of field.mask) if (m) kinds.add(m - 1);
    expect(kinds.size, 'the steps the hole uses').toBeGreaterThanOrEqual(5);
  });
  it('grows the fairway as ever: kind one wherever the zone is fairway', () => {
    const zones = zonesOf(links1.layout);
    let fairway = 0;
    for (let cy = 0; cy < field.rows; cy += 5)
      for (let cx = 0; cx < field.cols; cx += 5) {
        const x = field.origin[0] + (cx + 0.5) * field.cell,
          y = field.origin[1] + (cy + 0.5) * field.cell;
        if (zones.at(x, y) !== 'fairway') continue;
        expect(field.mask[cy * field.cols + cx]).toBe(2);
        fairway++;
      }
    expect(fairway).toBeGreaterThan(200);
  });
  it('is the rough alone on minigolf', () => {
    const mini = layoutOf(COURSES[0].holes[0].map);
    expect(fieldOf(mini, COURSES[0].holes[0].name).kinds).toEqual([KINDS[ROUGH]]);
  });
});

describe('the scene paints the rough and out of bounds a mesh to each step, and nothing else', () => {
  const groups = (l: Layout, name: string) => new Scene().static(l, name);
  const same = (a?: readonly number[], b?: readonly number[]) =>
    !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  it('has a mesh of the rough in each colour of the field, from the valley to the crest, the middle one the rough as it was', () => {
    for (const { layout, h } of [links1, isles2]) {
      const all = groups(layout, h.name);
      for (const [c, oob] of [
        [PALETTE.playRough, false],
        [PALETTE.oobGround, true],
      ] as const) {
        const found = [...Array(BANK_TINT.steps).keys()].map((k) =>
          all.filter((g) => same(g.albedo, tinted(c, valueOfStep(k), oob).slice(0, 3))),
        );
        expect(found.filter((g) => g.length).length, 'steps drawn').toBeGreaterThanOrEqual(10);
        // the lightest of the field's steps is a lighter ground than the darkest
        const lit = (g: (typeof all)[0]) => light(g.albedo as number[]);
        const drawn = found.flat().sort((a, b) => lit(a) - lit(b));
        expect(lit(drawn.at(-1)!)).toBeGreaterThan(lit(drawn[0]));
      }
    }
  });
  it('is the same ground: the meshes of the rough together are the area of the rough', () => {
    const { layout, h } = links1;
    const all = groups(layout, h.name);
    const painted = all.filter((g) =>
      [...Array(BANK_TINT.steps).keys()].some((k) =>
        same(g.albedo, tinted(PALETTE.playRough, valueOfStep(k)).slice(0, 3)),
      ),
    );
    expect(painted.length).toBeGreaterThanOrEqual(10);
    for (const g of painted) expect(g.texture, 'a plain colour, not a texture').toBeUndefined();
  });
  it('leaves the plain plane beyond the hole as it was: one mesh in the colour of out of bounds, far wider than the hole', () => {
    const { layout, h } = links1;
    const wide = groups(layout, h.name).filter(
      (g) =>
        same(g.albedo, PALETTE.oobGround) &&
        Math.max(...g.mesh.positions.filter((_, i) => i % 3 === 0)) > layout.bounds.maxX + 100,
    );
    expect(wide.length).toBe(1);
  });
  it('adds no mesh to a hole of minigolf', () => {
    const meadow = hole('The Meadow', 0);
    expect(tintOf(meadow.layout)).toBeNull();
  });
});

describe('what a hole costs to begin', () => {
  it('makes the tint of the longest hole of The Isles, and divides its rough and out of bounds, in under 150 ms', () => {
    // the best of five, each on a layout of its own since the tint is kept by layout: one cold run inside the whole suite,
    // a hundred files on every core, read over 100 ms, and alone the five read 73 to 80 (9 October 2026, load 14), so the
    // ceiling is about twice the best, as the zones' own test sets its
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const big = hole('The Isles', 8);
      const ground = groundOf(big.layout).golf!;
      const t0 = performance.now();
      const tint = tintOf(big.layout)!;
      splitByTint(ground.rough, tint);
      splitByTint(ground.oob, tint);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[0], `best of ${times.map((t) => t.toFixed(0)).join(', ')} ms`).toBeLessThan(150);
  });
});
