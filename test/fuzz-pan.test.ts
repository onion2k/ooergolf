/**
 * The monkey on a desert: The Links' holes with a lake, made in the desert biome (a throwaway biome, since no course is one yet), so
 * that every lake is a pan. Every seed clean, balls flown to a pan on a chance of their own and never lost to it. Apart from
 * `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';

describe('the fuzzer on a desert', () => {
  it('flies to a pan and plays on from it, every seed clean, with no ball lost to water', () => {
    const holes = LINKS_SPECS.filter((s) => s.ponds.length > 0 || s.lakes).map((s) =>
      golfHole({ ...s, biome: 'desert' }),
    );
    expect(holes.length).toBeGreaterThan(3);
    let flown = 0,
      splash = 0,
      played = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = fuzz(seed, 8000, holes);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      flown += r.done['fly to a pan'] || 0;
      splash += r.happened.splash || 0;
      played += r.happened.struck || 0;
    }
    // a check that never ran passes in silence
    expect(played, 'strokes were taken').toBeGreaterThan(50);
    expect(flown, 'a ball was flown to a pan').toBeGreaterThan(3);
    expect(splash, 'no hole of the desert has water to lose a ball in').toBe(0);
  });
});
