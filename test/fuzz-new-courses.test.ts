/**
 * The monkey on The Heath, The Woods and The Old Course, the three courses of 14 October 2026: every seed clean, a drive
 * along a lane through a wood on each of the first two and a shot at an island on the third, and the water, slope and tree
 * rules held throughout. Apart from `fuzz.test.ts` and `fuzz-fells-isles.test.ts`, which say why: a file of fuzz runs must
 * stay inside a worker's minute on a slow machine.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { COURSES } from '../src/course';

describe('the fuzzer', () => {
  it('plays The Heath, The Woods and The Old Course at random, every seed clean: lanes driven, an island shot at, and every rule held', () => {
    const lanes: Record<string, number> = {};
    let island = 0;
    for (const [name, seeds] of [
      ['The Heath', [1, 2, 3]],
      ['The Woods', [1, 2, 3]],
      // seed 12 found a ball at rest inside a crown on The Burn (14 October 2026), and is kept
      ['The Old Course', [1, 2, 3, 12]],
    ] as const) {
      const holes = COURSES.find((c) => c.name === name)!.holes;
      const visited = new Set<string>();
      for (const seed of seeds) {
        const r = fuzz(seed, 6000, holes);
        expect(r.failure, `${name} seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        lanes[name] = (lanes[name] ?? 0) + (r.done['drive the lane'] || 0);
        island += name === 'The Old Course' ? r.done['fly to an island'] || 0 : 0;
        for (const hole of Object.keys(r.visited)) visited.add(hole);
      }
      for (const hole of visited)
        expect(
          holes.map((h) => h.name),
          hole,
        ).toContain(hole);
      expect(visited.size, `${name}: a good many of its holes played`).toBeGreaterThanOrEqual(3);
    }
    expect(lanes['The Heath'], 'drives along a lane of The Heath, slipped').toBeGreaterThan(0);
    expect(lanes['The Woods'], 'drives along a lane of The Woods, slipped').toBeGreaterThan(0);
    expect(island, 'shots at an island of The Old Course').toBeGreaterThan(0);
  });
});
