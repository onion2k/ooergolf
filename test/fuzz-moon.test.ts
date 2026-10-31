/**
 * The three courses of the Moon under the monkey: the fuzzer plays each course's nine holes at random on four seeds, every rule
 * of `invariants.ts` checked as it goes. A course is not in the fuzzer's queue (`scripts/fuzz.ts`) until the game lists it; until
 * then this is the only place the monkey reaches a crater, a lake with an island on the Moon, or a shelf of running ground at its
 * pace of the clock. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { COURSES } from '../src/course';
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

  // found by `npm run fuzz -- --seeds 1-24` on 31 October 2026: a 3-wood aimed from the rough of Sea of Rains and struck with a
  // sideways miss came down on ground two yards lower than the ring the preview showed, and flew on past the box the check drew
  it('plays seed 22 on Copernicus as the gate does: a shot that misses sideways onto lower ground is held to the ground it found', () => {
    const course = COURSES.find((c) => c.name === 'Copernicus')!;
    const r = fuzz(22, 4000, course.holes, { name: course.name, purse: course.purse });
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
  }, 120_000);
});
