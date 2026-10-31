/**
 * The three Future courses under the monkey: `fuzzer.ts` plays each course's nine holes at random, four seeds, every rule held at
 * every step. The courses are not in `scripts/fuzz.ts` yet (the plan puts them there with all the others), so this is where
 * their holes are driven at random; without it a hologram wood, a mirror beside a green or a run-out down to the water could
 * break a rule that only the autopilot's careful play never reached. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { chromeHeights } from '../src/chrome';
import type { HoleDef } from '../src/course';
import { neonPark } from '../src/neonpark';
import { singularity } from '../src/singularity';

const COURSES: [string, () => readonly HoleDef[]][] = [
  ['Neon Park', neonPark],
  ['Chrome Heights', chromeHeights],
  ['The Singularity', singularity],
];

describe('the Future courses at random', () => {
  for (const [title, holes] of COURSES) {
    it(`${title}: four seeds of the monkey break no rule, and it strikes the ball`, () => {
      let struck = 0,
        lost = 0;
      for (const seed of [1, 2, 3, 4]) {
        const r = fuzz(seed, 8000, holes());
        expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        struck += r.happened.struck || 0;
        lost += (r.happened.splash || 0) + (r.happened.outOfBounds || 0);
      }
      expect(struck, 'strokes were taken').toBeGreaterThan(50);
      expect(lost, 'a ball was lost, in a mirror or out of bounds').toBeGreaterThan(0);
    }, 240000);
  }
});
