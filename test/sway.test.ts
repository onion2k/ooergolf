/** The course's things in the hole's wind: the flag flying down it, the trees leaning with it, the ripples swelling. */
import { describe, expect, it } from 'vitest';
import { gust, type Wind } from 'artshape-render/game/grass';
import {
  RIPPLES,
  SPLASH_RING,
  SWAY,
  WAGGLE,
  flagTurn,
  lean,
  ringPlace,
  ripples,
  splashRing,
  waggle,
} from '../src/sway';

const EAST: Wind = { direction: [1, 0], strength: 0.5, gustSize: 20, gustSpeed: 4 };
const NORTH: Wind = { direction: [0, 1], strength: 0.5, gustSize: 20, gustSpeed: 4 };

const over = (f: (t: number) => number, seconds = 20) => {
  const xs = Array.from({ length: seconds * 60 }, (_, k) => f(k / 60));
  return { least: Math.min(...xs), most: Math.max(...xs) };
};

/** An angle brought within a half turn either way. */
const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('the wind', () => {
  it('flies the flag down it, fluttering a little either way with the gusts, never round', () => {
    for (const wind of [EAST, NORTH]) {
      const down = Math.atan2(wind.direction[1], wind.direction[0]);
      const { least, most } = over((t) => turn(flagTurn(t, 0, 0, wind) - down));
      expect(least).toBeGreaterThanOrEqual(-SWAY.flag - 1e-9);
      expect(most).toBeLessThanOrEqual(SWAY.flag + 1e-9);
      expect(most - least, 'it flutters').toBeGreaterThan(0.1);
    }
  });

  it('flutters the flag wider in a gust than in a lull, the gust the grass bends in', () => {
    const down = Math.atan2(EAST.direction[1], EAST.direction[0]);
    const strong: number[] = [],
      weak: number[] = [];
    for (let t = 0; t < 120; t += 1 / 30) {
      const off = Math.abs(turn(flagTurn(t, 3, 4, EAST) - down));
      const g = gust(3, 4, EAST, t);
      if (g > 0.7) strong.push(off);
      else if (g < 0.3) weak.push(off);
    }
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    expect(strong.length, 'gusts seen').toBeGreaterThan(100);
    expect(weak.length, 'lulls seen').toBeGreaterThan(100);
    expect(mean(strong)).toBeGreaterThan(mean(weak) * 1.3);
  });

  it('leans a tree along the wind, by the gust where it stands, and no two trees alike', () => {
    for (const wind of [EAST, NORTH]) {
      let along = 0,
        across = 0;
      for (let t = 0; t < 20; t += 1 / 30) {
        const [lx, ly] = lean(t, 5, 8, wind);
        along += Math.abs(lx * wind.direction[0] + ly * wind.direction[1]);
        across += Math.abs(-lx * wind.direction[1] + ly * wind.direction[0]);
        expect(Math.hypot(lx, ly)).toBeLessThanOrEqual(SWAY.tree + 1e-9);
      }
      expect(along, 'mostly with the wind').toBeGreaterThan(across * 2);
    }
    expect(lean(3.3, 1, 1, EAST)).not.toEqual(lean(3.3, 30, 7, EAST));
  });

  it('stands still in no wind, but for the flag hanging where it is', () => {
    const calm: Wind = { ...EAST, strength: 0 };
    expect(lean(4.2, 3, 3, calm)).toEqual([0, 0]);
  });

  it('spreads each ripple from a small ring to a wide one as it fades, over its period, and gives it another place each time round', () => {
    const start = ripples(0, 5, 0);
    // a whole period on, the same ring the same size and fade, at another place
    const round = ripples(RIPPLES.period, 5, 0);
    expect(round.grow).toBeCloseTo(start.grow, 9);
    expect(round.fade).toBeCloseTo(start.fade, 9);
    let moved = 0;
    for (let c = 0; c < 20; c++) {
      const a = ripples(c * RIPPLES.period, 5, 1),
        b = ripples((c + 1) * RIPPLES.period, 5, 1);
      if (a.u !== b.u || a.v !== b.v) moved++;
    }
    expect(moved, 'a new place each time round').toBeGreaterThan(17);
    // over one life: growing all the while, fading all the while, small and bright at its start, wide and gone at its end
    let grow = -1,
      fade = 2;
    for (let f = 0; f < 200; f++) {
      const r = ripples(f * (RIPPLES.period / 200) + 0.0001, 3, 0);
      if (f > 0 && r.grow < grow) throw new Error(`shrank at ${f}`);
      if (f > 0 && r.fade > fade) throw new Error(`brightened at ${f}`);
      expect(r.grow).toBeGreaterThan(0);
      expect(r.grow).toBeLessThanOrEqual(1);
      expect(r.fade).toBeGreaterThanOrEqual(0);
      expect(r.fade).toBeLessThanOrEqual(1);
      [grow, fade] = [r.grow, r.fade];
    }
    expect(ripples(0.001, 3, 0).fade, 'bright as it begins').toBeGreaterThan(0.95);
    expect(ripples(0.001, 3, 0).grow, 'and small').toBeLessThan(0.35);
    expect(
      ripples(RIPPLES.period - 0.001, 3, 0).fade,
      'gone as it ends, so its place changing is not seen',
    ).toBeLessThan(0.02);
    expect(ripples(RIPPLES.period - 0.001, 3, 0).grow, 'wide').toBeGreaterThan(0.95);
  });

  it('keeps several ripples on the water at once, at different points of their lives, the same at the same moment', () => {
    expect(RIPPLES.each).toBeGreaterThanOrEqual(3);
    for (let t = 0; t < 30; t += 0.25) {
      const rings = Array.from({ length: RIPPLES.each }, (_, k) => ripples(t, 2, k));
      expect(Math.max(...rings.map((r) => r.fade)), `something to see at ${t}`).toBeGreaterThan(0.4);
      expect(new Set(rings.map((r) => r.grow.toFixed(3))).size, 'not all at one point of their lives').toBeGreaterThan(
        1,
      );
    }
    expect(ripples(7.3, 2, 1)).toEqual(ripples(7.3, 2, 1));
    expect(ripples(7.3, 2, 1)).not.toEqual(ripples(7.3, 3, 1));
  });

  it('places every ripple inside the water it is on, at every size it has, in any pond', () => {
    for (const free of [
      { hx: 2.3, hy: 3.7 },
      { hx: 0.9, hy: 0.9 },
      { hx: 5, hy: 1.2 },
    ])
      for (let seed = 1; seed <= 6; seed++)
        for (let k = 0; k < RIPPLES.each; k++)
          for (let t = 0; t < 40; t += 0.13) {
            const r = ripples(t, seed, k);
            const p = ringPlace(free, 1.1, r);
            expect(Math.abs(p.x) + p.radius, `across, seed ${seed} ring ${k} at ${t}`).toBeLessThanOrEqual(
              free.hx + 1e-9,
            );
            expect(Math.abs(p.y) + p.radius, `along`).toBeLessThanOrEqual(free.hy + 1e-9);
            expect(p.radius).toBeGreaterThan(0);
            expect(p.radius).toBeLessThanOrEqual(1.1 + 1e-9);
          }
  });

  it('rings out where a ball went in, wide as it fades, and is gone at its end, exactly, as before', () => {
    expect(splashRing(-0.1).fade, 'not before').toBe(0);
    expect(splashRing(SPLASH_RING.lasts).fade, 'and gone').toBe(0);
    expect(splashRing(SPLASH_RING.lasts + 3).fade).toBe(0);
    expect(splashRing(0.001).fade, 'bright at once').toBeGreaterThan(0.9);
    expect(splashRing(0.001).grow, 'small at once').toBeLessThan(0.3);
    let grow = 0,
      fade = 2;
    for (let f = 1; f < 120; f++) {
      const r = splashRing((f / 120) * SPLASH_RING.lasts);
      expect(r.grow).toBeGreaterThanOrEqual(grow);
      expect(r.fade).toBeLessThanOrEqual(fade);
      [grow, fade] = [r.grow, r.fade];
    }
    expect(splashRing(SPLASH_RING.lasts - 0.01).grow, 'wide').toBeGreaterThan(0.95);
  });

  it('waggles the flag as a ball drops: quickly either way from where it was, dying away to nothing, exactly', () => {
    expect(waggle(0), 'from where the wind had it, without a jump').toBe(0);
    const xs = Array.from({ length: WAGGLE.lasts * 600 }, (_, k) => waggle(k / 600));
    expect(Math.max(...xs), 'one way').toBeGreaterThan(0.25);
    expect(Math.min(...xs), 'and the other').toBeLessThan(-0.25);
    for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(WAGGLE.most + 1e-12);
    // a waggle, not a swing: back and forth several times
    let turns = 0;
    for (let k = 1; k < xs.length; k++) if (Math.sign(xs[k]) !== Math.sign(xs[k - 1]) && xs[k] !== 0) turns++;
    expect(turns).toBeGreaterThanOrEqual(4);
    // at rest from its end on, and nothing before the ball dropped
    for (const t of [WAGGLE.lasts, WAGGLE.lasts + 1e-9, 3, Infinity, -0.01, NaN]) expect(waggle(t)).toBe(0);
    expect(Math.abs(waggle(WAGGLE.lasts - 1 / 60)), 'settling into its end').toBeLessThan(0.01);
    for (let t = 0; t < WAGGLE.lasts; t += 1 / 60)
      expect(Math.abs(waggle(t + 1 / 60) - waggle(t)), 'quick, but never a jump').toBeLessThan(0.35);
  });

  it('moves slowly: never more than a little from one frame to the next', () => {
    for (let t = 0; t < 20; t += 1 / 60) {
      expect(Math.abs(turn(flagTurn(t + 1 / 60, 2, 2, EAST) - flagTurn(t, 2, 2, EAST)))).toBeLessThan(0.05);
      expect(Math.abs(lean(t + 1 / 60, 4, 4, EAST)[0] - lean(t, 4, 4, EAST)[0])).toBeLessThan(0.01);
    }
  });
});
