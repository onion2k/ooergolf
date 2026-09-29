/** The twinkles on what is gold: brief, one place at a time, now and then, and the same at the same moment every time. */
import { describe, expect, it } from 'vitest';
import { FLASH, GLINT, SPARKLE, flash, glint, sparkle, sparkles } from '../src/glints';

describe('a glint', () => {
  it('is nothing most of the time, and flares briefly now and then at one of its places', () => {
    let lit = 0;
    const seen = new Set<number>();
    for (let t = 0; t < 60; t += 1 / 60) {
      const g = glint(t, 5);
      if (g.brightness > 0) {
        lit++;
        seen.add(g.at);
        expect(g.brightness).toBeLessThanOrEqual(1);
      }
    }
    const share = lit / 3600;
    expect(share, 'lit a little of the time, not most of it').toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.25);
    expect(seen.size, 'at every one of its places, over a minute').toBe(5);
  });

  it('rises and falls, rather than switching on and off', () => {
    const [start] = [...Array(3600).keys()].map((f) => f / 60).filter((t) => glint(t, 3).brightness > 0);
    const peak = start + GLINT.flare / 2;
    expect(glint(start + 0.01, 3).brightness).toBeLessThan(glint(peak, 3).brightness);
    expect(glint(peak, 3).brightness).toBeGreaterThan(0.9);
  });

  it('flashes all the gold as a ball drops: brightest at once, fading, and gone at its end, exactly', () => {
    expect(flash(0)).toBe(1);
    for (let t = 1 / 60; t < FLASH.lasts; t += 1 / 60) {
      expect(flash(t), `fading at ${t.toFixed(2)}`).toBeLessThan(flash(t - 1 / 60));
      expect(flash(t)).toBeGreaterThan(0);
    }
    expect(FLASH.lasts, 'quick').toBeLessThanOrEqual(0.6);
    for (const t of [FLASH.lasts, FLASH.lasts + 1e-9, 2, Infinity, -0.01, NaN]) expect(flash(t)).toBe(0);
  });

  it('is the same at the same moment, and there is none where there is nothing to glint', () => {
    expect(glint(12.34, 4)).toEqual(glint(12.34, 4));
    expect(glint(12.34, 0).brightness).toBe(0);
  });
});

describe('the sparkles on water', () => {
  it('are lit for a share of each period, brightest in the middle, and dark the rest of it', () => {
    let lit = 0;
    for (let f = 0; f < 6000; f++) {
      const s = sparkle(f / 100, 4, 0);
      expect(s.brightness).toBeGreaterThanOrEqual(0);
      expect(s.brightness).toBeLessThanOrEqual(1);
      if (s.brightness > 0) lit++;
    }
    expect(lit / 6000, 'lit as much of the time as it is asked to be').toBeCloseTo(SPARKLE.lit, 1);
    // a rise and a fall, and at the middle of its lit part, full
    const t0 = 1 * SPARKLE.period;
    expect(sparkle(t0 + (SPARKLE.period * SPARKLE.lit) / 2, 4, 0).brightness).toBeGreaterThan(0.95);
    expect(sparkle(t0 + 0.01, 4, 0).brightness).toBeLessThan(0.3);
  });

  it('are at a place of their own each time round, inside the water, the same at the same moment', () => {
    const seen = new Set<string>();
    for (let c = 0; c < 30; c++) {
      const s = sparkle((c + 0.5) * SPARKLE.period * 1.0, 9, 2);
      expect(Math.abs(s.u)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.v)).toBeLessThanOrEqual(1);
      seen.add(`${s.u.toFixed(3)},${s.v.toFixed(3)}`);
    }
    expect(seen.size, 'another place each time').toBeGreaterThan(25);
    expect(sparkle(3.3, 9, 2)).toEqual(sparkle(3.3, 9, 2));
    expect(sparkle(3.3, 9, 2)).not.toEqual(sparkle(3.3, 9, 3));
    expect(sparkle(3.3, 9, 2)).not.toEqual(sparkle(3.3, 8, 2));
  });

  it('are shared out among a hole’s ponds, at least one each to six, and never more than the most in all', () => {
    expect(sparkles(0)).toEqual([]);
    for (let ponds = 1; ponds <= 8; ponds++) {
      const shares = sparkles(ponds);
      expect(shares.length).toBe(ponds);
      const total = shares.reduce((a, b) => a + b, 0);
      expect(total, `${ponds} ponds`).toBeLessThanOrEqual(SPARKLE.most);
      expect(total).toBeGreaterThan(0);
      if (ponds <= SPARKLE.most) for (const n of shares) expect(n, 'each pond has some').toBeGreaterThanOrEqual(1);
      expect(Math.max(...shares) - Math.min(...shares), 'fairly').toBeLessThanOrEqual(1);
    }
    expect(SPARKLE.most, 'with room left in the effects for the gold, at most five').toBeLessThanOrEqual(6);
  });
});
