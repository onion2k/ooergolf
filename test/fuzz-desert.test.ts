/**
 * The monkey on the desert's three courses: every hole of each, four seeds, no rule broken, with balls flown to a pan and driven at a
 * cactus on chances of their own and never lost to either. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { DESERT, madeOf } from './desert';

describe('the fuzzer on the desert courses', () => {
  for (const [name, specs] of Object.entries(DESERT)) {
    it(`plays ${name} at random, four seeds clean, to a pan and at a cactus`, () => {
      const { holes } = madeOf(specs);
      let struck = 0,
        pans = 0,
        cacti = 0,
        splash = 0;
      for (const seed of [1, 2, 3, 4]) {
        const r = fuzz(seed, 8000, holes);
        expect(r.failure, `${name}, seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        struck += r.happened.struck || 0;
        pans += r.done['fly to a pan'] || 0;
        cacti += r.done['drive at a tree'] || 0;
        splash += r.happened.splash || 0;
      }
      // a check that never ran passes in silence
      expect(struck, 'strokes were taken').toBeGreaterThan(100);
      expect(pans, 'a ball was flown to a pan').toBeGreaterThan(0);
      expect(cacti, 'a ball was driven at a cactus').toBeGreaterThan(0);
      expect(splash, 'a desert has no water to lose a ball in').toBe(0);
    }, 300_000);
  }
});
