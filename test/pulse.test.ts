/** The aim's dots, pulsing gently while a drag is held: a swell running out along them from the ball, from game time. */
import { describe, expect, it } from 'vitest';
import { PULSE, pulse } from '../src/pulse';

describe('the aim pulsing', () => {
  it('swells each dot and eases it back, never far from its size', () => {
    const xs = Array.from({ length: 600 }, (_, f) => pulse(f / 60, 3));
    expect(Math.max(...xs), 'swells').toBeGreaterThan(1.08);
    expect(Math.min(...xs), 'and eases').toBeLessThan(0.92);
    for (const x of xs) {
      expect(x).toBeLessThanOrEqual(1 + PULSE.size + 1e-12);
      expect(x).toBeGreaterThanOrEqual(1 - PULSE.size - 1e-12);
    }
    expect(PULSE.size, 'gently').toBeLessThanOrEqual(0.2);
  });

  it('runs out along the dots from the ball: each swells a moment after the one before it', () => {
    // the first moment each dot is at its fullest, after the ball's nearest has been
    const peak = (k: number) => {
      let best = 0,
        when = 0;
      // over one swell, a six-hundredth of a second at a time
      for (let f = 0; f < 600 / PULSE.often; f++) {
        const p = pulse(f / 600, k);
        if (p > best) [best, when] = [p, f / 600];
      }
      return when;
    };
    expect(peak(1)).toBeGreaterThan(peak(0));
    expect(peak(2)).toBeGreaterThan(peak(1));
  });

  it('keeps game time: the same at the same moment, and round again each beat', () => {
    expect(pulse(3.3, 2)).toBe(pulse(3.3, 2));
    expect(pulse(3.3 + 1 / PULSE.often, 2)).toBeCloseTo(pulse(3.3, 2), 9);
  });

  it('moves gently, a little from one frame to the next', () => {
    for (let t = 0; t < 5; t += 1 / 60) expect(Math.abs(pulse(t + 1 / 60, 4) - pulse(t, 4))).toBeLessThan(0.03);
  });
});
