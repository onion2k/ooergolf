/** The gentle movement of the course's things in the breeze: small, slow, never still for long, and each out of step. */
import { describe, expect, it } from 'vitest';
import { SWAY, flagTurn, lean, ripple } from '../src/sway';

const over = (f: (t: number) => number, seconds = 20) => {
  const xs = Array.from({ length: seconds * 60 }, (_, k) => f(k / 60));
  return { least: Math.min(...xs), most: Math.max(...xs), xs };
};

describe('the breeze', () => {
  it('swings the flag about its pin a little either way, never round', () => {
    const { least, most } = over(flagTurn);
    expect(most - least).toBeGreaterThan(0.2);
    expect(most - least).toBeLessThan(SWAY.flag * 2 + 1e-9);
  });

  it('leans a tree a degree or two, and no two trees alike', () => {
    for (const seed of [1, 2, 3]) {
      const { least, most } = over((t) => lean(t, seed)[0]);
      expect(most).toBeLessThan(SWAY.tree + 1e-9);
      expect(least).toBeGreaterThan(-SWAY.tree - 1e-9);
      expect(most - least).toBeGreaterThan(SWAY.tree * 0.5);
    }
    expect(lean(3.3, 1)).not.toEqual(lean(3.3, 2));
  });

  it('swells the ripples and lets them settle, round a size of one', () => {
    const { least, most } = over((t) => ripple(t, 0));
    expect(least).toBeGreaterThan(0.8);
    expect(most).toBeLessThan(1.2);
    expect(most - least).toBeGreaterThan(0.1);
  });

  it('moves slowly: never more than a little from one frame to the next', () => {
    for (let t = 0; t < 20; t += 1 / 60) {
      expect(Math.abs(flagTurn(t + 1 / 60) - flagTurn(t))).toBeLessThan(0.05);
      expect(Math.abs(lean(t + 1 / 60, 4)[1] - lean(t, 4)[1])).toBeLessThan(0.01);
    }
  });
});
