/**
 * The contour of a green: the swells and swales a putt breaks across, made with the ground the physics already has, so the
 * break is the physics' and putting stays the minigolf's own model. Held here, first the helper that makes the field on its
 * own (smooth, bounded, nought at the cup and at the green's edge, scaled to the steepest slope asked for, measured the way
 * the game measures it), then a hole that has one: the slope it ends with is the share of the green's steepest that its
 * spec says, the ground is legal and rests a ball, a hole without one is the hole it was, and the cup is gentle enough that
 * a ball struck dead at it from three yards drops.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, slopeAt, type Layout } from '../src/arena';
import { CUP } from '../src/course';
import { golfHole, type GolfSpec } from '../src/golf';
import { GREEN, breakOf } from '../src/green';
import { LINKS_SPECS, links } from '../src/links';
import { CONTOUR, greenContour, tiltAngle } from '../src/noise';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { LIE, rollOf } from '../src/surfaces';
import { DT, golfGame } from './helpers';

const SPEC: GolfSpec = {
  name: 'Contour Test',
  par: 4,
  length: 380,
  bend: 25,
  width: 13,
  seed: 5,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 2, green: 2 },
  ponds: [{ at: 0.62, side: -1, size: [3, 4] }],
  trees: 24,
};

const made = (over: Partial<GolfSpec> = {}) => golfHole({ ...SPEC, ...over });
const layoutFor = (h: ReturnType<typeof made>) => layoutOf(h.map, h.terrain);

/** The centre of tile `t`. */
const centre = (l: Layout, t: number): [number, number] => [
  l.originX + ((t % l.cols) + 0.5) * TILE,
  l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
];

/** The tiles of putting green, and the steepest slope (rise over run) the ground has at any one of their middles. */
function greenSlope(l: Layout): { tiles: number[]; steepest: number } {
  const tiles: number[] = [];
  let steepest = 0;
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (l.solid[t] || l.sand[t] || l.lie[t] !== LIE.green) continue;
    tiles.push(t);
    const [x, y] = centre(l, t);
    const [sx, sy] = slopeAt(l, x, y);
    steepest = Math.max(steepest, Math.hypot(sx, sy));
  }
  return { tiles, steepest };
}

/** The cup's tile, in tiles from the west and from the south. */
const cupTile = (l: Layout): [number, number] => [
  Math.floor((l.cup.x - l.originX) / TILE),
  Math.floor((l.cup.y - l.originY) / TILE),
];

describe('the helper that makes a green’s contour', () => {
  const map = ['#'.repeat(41), ...Array.from({ length: 39 }, () => '#' + 'g'.repeat(39) + '#'), '#'.repeat(41)];
  map[20] = '#' + 'g'.repeat(19) + 'C' + 'g'.repeat(19) + '#';
  map[1] = '#' + 'g'.repeat(19) + 'T' + 'g'.repeat(19) + '#';
  const level = layoutOf(map);
  const cx = 20,
    cy = 20;
  const radius = 5.5;
  const near = (t: number) => Math.hypot((t % 41) - cx, Math.floor(t / 41) - cy) <= radius;
  const tiles = Array.from({ length: 41 * 41 }, (_, t) => t).filter((t) => near(t) && !level.solid[t]);
  const make = (slope: number, seed = 3, tilt = 0) =>
    greenContour(level, { seed, x: cx, y: cy, radius, slope, tiles, tilt });

  /** The slope the game reads off a field, laid on level ground. */
  const slopeOf = (field: Float32Array, t: number) => {
    let lowest = 0;
    for (const v of field) lowest = Math.min(lowest, v);
    const l = { ...level, terrain: Float32Array.from(field, (v) => v - lowest) };
    const [x, y] = centre(l, t);
    return Math.hypot(...slopeAt(l, x, y));
  };

  it('is made for a tile’s worth of ground, finite, and (swells alone) nought at the cup and everywhere beyond the green', () => {
    const f = make(0.03);
    expect(f.length).toBe(41 * 41);
    for (const v of f) expect(Number.isFinite(v)).toBe(true);
    expect(f[cy * 41 + cx]).toBe(0);
    for (let t = 0; t < f.length; t++) {
      const d = Math.hypot((t % 41) - cx, Math.floor(t / 41) - cy);
      if (d >= radius) expect(f[t], `tile ${t} at ${d}`).toBe(0);
      if (d <= CONTOUR.cup[0]) expect(f[t], `tile ${t} at ${d} by the cup`).toBe(0);
    }
  });

  it('has the steepest slope asked for, over the tiles it was given, as the game’s own slope says it', () => {
    for (const want of [0.005, 0.02, 0.05]) {
      const f = make(want);
      let steepest = 0;
      for (const t of tiles) steepest = Math.max(steepest, slopeOf(f, t));
      expect(steepest / want, `a slope of ${want}`).toBeGreaterThan(0.99);
      expect(steepest / want).toBeLessThan(1.01);
    }
  });

  it('is nought for a slope of nought, the same for a seed and another thing for another seed, and rejects what is not a slope', () => {
    expect(Math.max(...make(0).map(Math.abs))).toBe(0);
    expect(Array.from(make(0.03, 4))).toEqual(Array.from(make(0.03, 4)));
    expect(Array.from(make(0.03, 4))).not.toEqual(Array.from(make(0.03, 5)));
    for (const bad of [-0.01, NaN, Infinity]) expect(() => make(bad), `${bad}`).toThrow(/slope/);
  });

  it('swells and swales both: it rises above the level and falls below it, and is smooth between', () => {
    const f = make(0.04);
    expect(Math.max(...f)).toBeGreaterThan(0);
    expect(Math.min(...f)).toBeLessThan(0);
    // no tile is more than a fifth of a yard from its neighbour at the steepest the green may be
    let worst = 0;
    for (let t = 0; t + 1 < f.length; t++) worst = Math.max(worst, Math.abs(f[t + 1] - f[t]));
    expect(worst).toBeLessThan(0.2);
  });
});

describe('the tilt of a green’s contour', () => {
  const map = ['#'.repeat(41), ...Array.from({ length: 39 }, () => '#' + 'g'.repeat(39) + '#'), '#'.repeat(41)];
  map[20] = '#' + 'g'.repeat(19) + 'C' + 'g'.repeat(19) + '#';
  map[1] = '#' + 'g'.repeat(19) + 'T' + 'g'.repeat(19) + '#';
  const level = layoutOf(map);
  const radius = 5.5;
  const tiles = Array.from({ length: 41 * 41 }, (_, t) => t).filter(
    (t) => Math.hypot((t % 41) - 20, Math.floor(t / 41) - 20) <= radius && !level.solid[t],
  );
  const make = (tilt: number, seed = 3, reach = 15) =>
    greenContour(level, { seed, x: 20, y: 20, radius, reach, slope: 0.1, tiles, tilt });
  const lean = (f: Float32Array, t: number): [number, number] => {
    let lowest = 0;
    for (const v of f) lowest = Math.min(lowest, v);
    const l = { ...level, terrain: Float32Array.from(f, (v) => v - lowest) };
    return slopeAt(l, ...centre(l, t));
  };

  it('is a plane through the cup when it is all there is: the same slope at every tile of the green, uphill along the seed’s own direction', () => {
    for (const seed of [1, 2, 3, 40]) {
      const f = make(1, seed);
      expect(f[20 * 41 + 20], 'at the cup').toBe(0);
      const angle = tiltAngle(seed);
      for (const t of tiles) {
        const [sx, sy] = lean(f, t);
        expect(Math.hypot(sx, sy), `seed ${seed}, tile ${t}`).toBeCloseTo(0.1, 3);
        expect(Math.cos(Math.atan2(sy, sx) - angle), `seed ${seed}, tile ${t}`).toBeGreaterThan(0.999);
      }
    }
  });

  it('carries on past the green to its reach and is nought from there: the plate that blends it into the hills has something to blend', () => {
    const f = make(1, 3, 15);
    for (let t = 0; t < f.length; t++) {
      const d = Math.hypot((t % 41) - 20, Math.floor(t / 41) - 20);
      if (d >= 15) expect(f[t], `at ${d} tiles`).toBe(0);
      if (d > radius + 1 && d < 12) expect(f[t], `at ${d} tiles`).not.toBe(0);
    }
  });

  it('points a seed’s way, any way round, the same every time, and not the same way for every seed', () => {
    const angles = Array.from({ length: 60 }, (_, seed) => tiltAngle(seed));
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(Math.PI * 2);
    }
    expect(tiltAngle(7)).toBe(tiltAngle(7));
    // spread round the compass: every quarter of it has a seed in it, and no two neighbours are alike
    for (let q = 0; q < 4; q++)
      expect(
        angles.some((a) => Math.floor(a / (Math.PI / 2)) === q),
        `quarter ${q}`,
      ).toBe(true);
    expect(new Set(angles).size).toBe(60);
  });

  it('is a share from nought to one, and anything else is refused by name', () => {
    for (const bad of [-0.1, 1.1, NaN]) expect(() => make(bad), `${bad}`).toThrow(/tilt/);
    expect(() => make(0)).not.toThrow();
    expect(() => make(1)).not.toThrow();
  });
});

describe('a golf hole with a contour', () => {
  it('is the hole it was without one: absent and nought are the same ground to the digit', () => {
    const a = made(),
      b = made({ contour: 0 });
    expect(Array.from(b.terrain as Float32Array)).toEqual(Array.from(a.terrain as Float32Array));
    expect(b.map).toEqual(a.map);
  });

  it('is refused by name when it is not from nought to one, and so are the greens when they are not from fast to slow', () => {
    for (const bad of [-0.1, 1.2, NaN, Infinity]) expect(() => made({ contour: bad }), `${bad}`).toThrow(/contour/);
    for (const bad of [5, 40, NaN, 0]) expect(() => made({ greens: bad }), `${bad}`).toThrow(/greens/);
    expect(() => made({ contour: 1, greens: 12 })).not.toThrow();
    expect(() => made({ contour: 0, greens: 22 })).not.toThrow();
  });

  it('has the steepest slope on its green of the contour times the steepest a green may be, within a tenth', () => {
    for (const spec of [SPEC, { ...SPEC, seed: 9 }, LINKS_SPECS[1], LINKS_SPECS[4], LINKS_SPECS[8]]) {
      for (const contour of [0.2, 0.6, 1]) {
        const l = layoutFor(golfHole({ ...spec, contour }));
        const { tiles, steepest } = greenSlope(l);
        expect(tiles.length, spec.name).toBeGreaterThan(40);
        const want = contour * GREEN.steepest;
        expect(steepest / want, `${spec.name} at ${contour}: ${steepest} against ${want}`).toBeGreaterThan(0.9);
        expect(steepest / want, `${spec.name} at ${contour}: ${steepest} against ${want}`).toBeLessThan(1.1);
      }
    }
  });

  it('has the tilt at the cup and no more, and level ground beyond the green a tile or two, so it joins the ground without a step', () => {
    const l = layoutFor(made({ contour: 1 }));
    const [cx, cy] = cupTile(l);
    // the cup stands on the tilt, which is a plane, so the slope there is much the same for the three yards round it: no
    // swell is felt within a yard (the swells come on from 1.2 tiles) and the tilt is not more than the peak the green has
    const at = (r: number, a: number) =>
      slopeAt(l, l.cup.x + Math.cos((a / 24) * Math.PI * 2) * r, l.cup.y + Math.sin((a / 24) * Math.PI * 2) * r);
    const [mx, my] = at(0, 0);
    expect(Math.hypot(mx, my), 'at the cup').toBeLessThanOrEqual(GREEN.steepest);
    expect(Math.hypot(mx, my), 'at the cup').toBeGreaterThan(0.5 * GREEN.steepest);
    for (let a = 0; a < 24; a++) {
      const [sx, sy] = at(1, a);
      expect(Math.hypot(sx - mx, sy - my), 'a yard from the cup, against the cup').toBeLessThan(0.1 * GREEN.steepest);
    }
    // just beyond the green the ground is the one plane the plate holds: no swell there, so its slope is the tilt's, the same
    // as at the cup (the spline's smoothing reaches two tiles, and the plate's blend into the hills begins at 7.5, so a tile and
    // a half is as far as that holds: measured at most 0.020, a fifth of the green's peak)
    for (let t = 0; t < l.cols * l.rows; t++) {
      const d = Math.hypot((t % l.cols) - cx, Math.floor(t / l.cols) - cy);
      if (d > 5.6 && d < 6.2) {
        const [sx, sy] = slopeAt(l, ...centre(l, t));
        expect(Math.hypot(sx - mx, sy - my), `at ${d} tiles`).toBeLessThan(0.25 * GREEN.steepest);
      }
    }
    // and no step between neighbours anywhere near it
    for (let t = 0; t + 1 < l.cols * l.rows; t++) {
      const d = Math.hypot((t % l.cols) - cx, Math.floor(t / l.cols) - cy);
      if (d < 14 && (t + 1) % l.cols) expect(Math.abs(l.terrain[t + 1] - l.terrain[t])).toBeLessThan(TILE / 2);
    }
  });

  it('has a peak slope of a tenth at a contour of one: the most a green is, and a tilt that is most of it', () => {
    expect(GREEN.steepest).toBeCloseTo(0.1, 10);
    for (const spec of [SPEC, LINKS_SPECS[8]]) {
      const { steepest } = greenSlope(layoutFor(golfHole({ ...spec, contour: 1 })));
      expect(steepest, spec.name).toBeGreaterThan(0.09);
      expect(steepest, spec.name).toBeLessThan(0.11);
    }
  });

  it('is tilted across its whole green, not turned in places: the mean slope on the green is at least seven tenths of the peak, on every hole of The Links', () => {
    for (const h of links()) {
      const { tiles, steepest } = greenSlope(layoutFor(h));
      let sum = 0;
      for (const t of tiles) sum += Math.hypot(...slopeAt(layoutFor(h), ...centre(layoutFor(h), t)));
      expect(sum / tiles.length / steepest, h.name).toBeGreaterThan(0.7);
    }
  });

  it('joins the hills by a plate whose steepest step is no steeper than the hills’ own, on every hole of The Links, and whatever the contour leaves the hills away from it as they were', () => {
    for (const spec of LINKS_SPECS) {
      const l = layoutFor(golfHole(spec));
      // the hills' steepest step is exactly the steepness times half a tile (the generator scales them to it), and no more
      let most = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if ((t + 1) % l.cols) most = Math.max(most, Math.abs(l.terrain[t + 1] - l.terrain[t]));
        if (t + l.cols < l.cols * l.rows) most = Math.max(most, Math.abs(l.terrain[t + l.cols] - l.terrain[t]));
      }
      expect(most, spec.name).toBeLessThanOrEqual(spec.steepness * (TILE / 2) + 1e-6);
      // a hole is not made gentler for how much its green is contoured: the hills past the plate are the same at any contour
      const other = layoutFor(golfHole({ ...spec, contour: spec.contour === 1 ? 0.5 : 1 }));
      const [cx, cy] = cupTile(l);
      let same = 0;
      for (let t = 0; t < l.cols * l.rows; t++)
        if (Math.hypot((t % l.cols) - cx, Math.floor(t / l.cols) - cy) > 34) {
          expect(l.terrain[t], `${spec.name}, tile ${t}`).toBe(other.terrain[t]);
          same++;
        }
      expect(same, spec.name).toBeGreaterThan(1000);
    }
  });

  it('rests a ball on every tile of tee, fairway and green of every hole of The Links at its most contoured, at the fastest greens and the slowest', () => {
    for (const spec of LINKS_SPECS)
      for (const greens of [12, 22]) {
        const l = layoutFor(golfHole({ ...spec, contour: 1, greens }));
        let tried = 0;
        for (let t = 0; t < l.cols * l.rows; t++) {
          const lie = l.lie[t];
          if (l.solid[t] || l.oob[t] || l.sand[t] || (lie !== LIE.fairway && lie !== LIE.green && lie !== LIE.tee))
            continue;
          const s = Math.hypot(...slopeAt(l, ...centre(l, t)));
          tried++;
          expect(s / Math.sqrt(1 + s * s), `${spec.name}, lie ${lie} at ${t}, greens ${greens}`).toBeLessThanOrEqual(
            (0.97 * rollOf(lie, greens)) / PHYSICS.gravity,
          );
        }
        expect(tried, spec.name).toBeGreaterThan(500);
      }
  });

  it('leaves the ground away from the green as it was: more than thirty-four tiles from the cup, the most the plate reaches, is the same hole', () => {
    const a = layoutFor(made()),
      b = layoutFor(made({ contour: 1 }));
    const [cx, cy] = cupTile(a);
    let same = 0;
    for (let t = 0; t < a.cols * a.rows; t++) {
      const d = Math.hypot((t % a.cols) - cx, Math.floor(t / a.cols) - cy);
      if (d > 34) {
        expect(b.terrain[t], `tile ${t} at ${d}`).toBe(a.terrain[t]);
        same++;
      }
    }
    expect(same).toBeGreaterThan(5000);
  });

  it('is legal to the physics, finite and never below nought, on every hole of The Links at every contour', () => {
    for (const spec of LINKS_SPECS)
      for (const contour of [0.3, 1]) {
        const h = golfHole({ ...spec, contour });
        const l = layoutFor(h);
        expect(terrainRefusal(l, CUP), `${spec.name} at ${contour}`).toBeNull();
        for (const v of l.terrain) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
  });

  it('still rests a ball on its tee, fairway and green, at every speed of green', () => {
    for (const greens of [12, 16, 22]) {
      const l = layoutFor(made({ contour: 1, greens }));
      for (let t = 0; t < l.cols * l.rows; t++) {
        const lie = l.lie[t];
        if (l.solid[t] || l.oob[t] || l.sand[t] || (lie !== LIE.fairway && lie !== LIE.green && lie !== LIE.tee))
          continue;
        const [x, y] = centre(l, t);
        const [sx, sy] = slopeAt(l, x, y);
        const s = Math.hypot(sx, sy);
        expect(s / Math.sqrt(1 + s * s), `lie ${lie} at ${t}, greens ${greens}`).toBeLessThanOrEqual(
          (0.97 * rollOf(lie, greens)) / PHYSICS.gravity,
        );
      }
    }
  });

  it('lifts a green that stands at nought, so that the swales are not below it, and never leaves a tile below nought', () => {
    // a spec whose cup was found at nought without a contour: its swales would go under the ground
    let lowest: { seed: number; level: number } | null = null;
    for (let seed = 1; seed <= 40; seed++) {
      const l = layoutFor(golfHole({ ...SPEC, seed, bunkers: { fairway: 0, green: 0 }, ponds: [], trees: 0 }));
      const [cx, cy] = cupTile(l);
      const level = l.terrain[cy * l.cols + cx];
      if (!lowest || level < lowest.level) lowest = { seed, level };
    }
    expect(lowest!.level, 'the lowest green of forty seeds').toBeLessThan(0.5);
    const h = golfHole({
      ...SPEC,
      seed: lowest!.seed,
      bunkers: { fairway: 0, green: 0 },
      ponds: [],
      trees: 0,
      contour: 1,
    });
    const l = layoutFor(h);
    const [cx, cy] = cupTile(l);
    expect(l.terrain[cy * l.cols + cx]).toBeGreaterThan(0);
    let least = Infinity;
    for (const v of l.terrain) least = Math.min(least, v);
    expect(least).toBeGreaterThanOrEqual(0);
  });
});

describe('the break on The Links', () => {
  /** How far each putt breaks across its line, in yards, from every tile of green five to twenty-five yards from the cup, per hole. */
  const acrossOf = (h: ReturnType<typeof links>[number]) => {
    const l = layoutFor(h);
    const out: number[] = [];
    for (let t = 0; t < l.cols * l.rows; t++) {
      const [x, y] = centre(l, t);
      if (lieAt(l, x, y) !== LIE.green) continue;
      const d = Math.hypot(x - l.cup.x, y - l.cup.y);
      if (d >= 5 && d <= 25) out.push(Math.abs(breakOf(l, x, y, h.greens).across));
    }
    return out.sort((a, b) => a - b);
  };
  const at = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const per = links().map(acrossOf);
  const all = per.flat().sort((a, b) => a - b);

  it('matters across the course: the median putt breaks half a yard, a tenth of them by nearly two, and an eighth to a quarter by more than the cup’s radius', () => {
    expect(all.length).toBeGreaterThan(600);
    expect(at(all, 0.5), 'the median').toBeGreaterThanOrEqual(0.5);
    expect(at(all, 0.9), 'the ninetieth').toBeGreaterThanOrEqual(1.8);
    const over = all.filter((a) => a > CUP.radius).length / all.length;
    expect(over, 'the share past the cup’s radius').toBeGreaterThanOrEqual(0.12);
    expect(over, 'the share past the cup’s radius').toBeLessThanOrEqual(0.25);
  });

  it('is gentlest on the opener, which is still a green to read, and greatest on the last', () => {
    expect(at(per[0], 0.5), 'the opener’s median').toBeGreaterThan(0.1);
    expect(at(per[0], 0.5), 'the opener’s median').toBeLessThan(0.5 * at(all, 0.5) + 0.2);
    const last = per[per.length - 1];
    expect(at(last, 0.5), 'the last’s median').toBeGreaterThanOrEqual(1);
    expect(at(last, 0.9), 'the last’s ninetieth').toBeGreaterThanOrEqual(2.5);
    for (const a of per.slice(0, -1)) expect(at(a, 0.5)).toBeLessThan(at(last, 0.5));
    for (const a of per.slice(1)) expect(at(a, 0.5)).toBeGreaterThan(at(per[0], 0.5));
  });
});

describe('the cup on the most contoured green', () => {
  /** A putt struck dead at the cup from three yards off, at `power`, in a rehearsal of the hole: whether it dropped, and how far it went. */
  function drops(hole: ReturnType<typeof made>, angle: number, power: number) {
    const { game } = golfGame(hole);
    const g = game.rehearsal();
    const { cup } = g.layout;
    const from = { x: cup.x + Math.cos(angle) * 3, y: cup.y + Math.sin(angle) * 3 };
    g.trial(from.x, from.y);
    g.pick('putter');
    expect(g.shoot(angle + Math.PI, power)).toBe(true);
    for (let f = 0; f < 60 * 30 && g.phase === 'play' && !(f > 1 && g.ready); f++) g.step(DT);
    return {
      holed: g.phase === 'done',
      rest: Math.hypot(g.world.x[g.ball] - cup.x, g.world.y[g.ball] - cup.y),
      went: Math.hypot(g.world.x[g.ball] - from.x, g.world.y[g.ball] - from.y),
    };
  }

  it('takes a ball struck at it from three yards from every side, over most of the powers there are, and from the first that gets there, at every speed of green', () => {
    // the tilt carries the ball off the cup's line as it goes, so "the weakest that reaches the edge" is not a ball dead at the
    // cup (it may die just short of the lip on the way), and what is held is that the cup takes it over most of the powers
    for (const greens of [12, 16, 22]) {
      const hole = golfHole({ ...LINKS_SPECS[8], contour: 1, greens });
      for (let a = 0; a < 8; a++) {
        const angle = (a / 8) * Math.PI * 2 + 0.3;
        let holed = 0,
          weakest = Infinity;
        for (let p = 0.02; p <= 0.4; p += 0.01) {
          if (drops(hole, angle, p).holed) {
            holed++;
            weakest = Math.min(weakest, p);
          }
        }
        expect(holed, `greens ${greens}, side ${a}: powers that drop`).toBeGreaterThanOrEqual(20);
        expect(weakest, `greens ${greens}, side ${a}: the weakest that drops`).toBeLessThanOrEqual(0.08);
      }
    }
  });
});
