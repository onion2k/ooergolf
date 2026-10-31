/**
 * The three courses of the Moon under the monkey: the fuzzer plays each course's nine holes at random on four seeds, every rule
 * of `invariants.ts` checked as it goes. A course is not in the fuzzer's queue (`scripts/fuzz.ts`) until the game lists it; until
 * then this is the only place the monkey reaches a crater, a lake with an island on the Moon, or a shelf of running ground at its
 * pace of the clock. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { copernicus } from '../src/copernicus';
import { farside } from '../src/farside';
import { tranquility } from '../src/tranquility';

describe('the monkey on the Moon', () => {
  for (const [title, make] of [
    ['Tranquility', tranquility],
    ['Copernicus', copernicus],
    ['The Far Side', farside],
  ] as const)
    for (const seed of [1, 2, 3, 4])
      it(`plays ${title} at random on seed ${seed}, no rule broken`, () => {
        const r = fuzz(seed, 8000, make());
        expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        expect(r.happened.struck || 0, 'strokes were taken').toBeGreaterThan(30);
      }, 120_000);
});
