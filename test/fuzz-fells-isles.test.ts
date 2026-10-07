/**
 * The monkey on The Fells and The Isles, the two hard courses: every seed clean, a drive along the lane through a wood, a
 * shot at an island, and the water and slope rules held throughout. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { COURSES } from '../src/course';

describe('the fuzzer', () => {
  it('plays The Fells and The Isles at random, every seed clean: a drive along the lane through a wood, a shot at an island, and the water and slope rules held throughout', () => {
    let lane = 0,
      island = 0;
    for (const [name, seeds] of [
      ['The Fells', [1, 2, 3, 4, 11]],
      ['The Isles', [1, 2, 3, 4]],
    ] as const) {
      const holes = COURSES.find((c) => c.name === name)!.holes;
      const visited = new Set<string>();
      for (const seed of seeds) {
        const r = fuzz(seed, 8000, holes);
        expect(r.failure, `${name} seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        lane += r.done['drive the lane'] || 0;
        island += r.done['fly to an island'] || 0;
        for (const hole of Object.keys(r.visited)) visited.add(hole);
      }
      for (const hole of visited)
        expect(
          holes.map((h) => h.name),
          hole,
        ).toContain(hole);
      expect(visited.size, `${name}: a good many of its holes played`).toBeGreaterThanOrEqual(3);
    }
    expect(lane, 'drives along a lane, slipped').toBeGreaterThan(0);
    expect(island, 'shots at an island').toBeGreaterThan(0);
  });
});
