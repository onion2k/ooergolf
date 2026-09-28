/** The twinkles on what is gold: brief, one place at a time, now and then, and the same at the same moment every time. */
import { describe, expect, it } from 'vitest';
import { FLASH, GLINT, flash, glint } from '../src/glints';

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
