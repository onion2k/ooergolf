/**
 * The monkey on The Fells and The Isles, the two hard courses: every seed clean, a drive along the lane through a wood, a
 * shot at an island, and the water and slope rules held throughout. Apart from `fuzz.test.ts`, which says why. A course is
 * a test of its own: the two in one took 21 seconds alone, and with every core busy passed the 30 a test is given, so the
 * whole suite failed on a loaded machine for no fault in the game.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { COURSES } from '../src/course';

/** A course played at random on each seed, every one clean and a good many holes reached; how often each thing was done. */
function played(name: string, seeds: readonly number[]): Record<string, number> {
  const holes = COURSES.find((c) => c.name === name)!.holes;
  const visited = new Set<string>();
  const done: Record<string, number> = {};
  for (const seed of seeds) {
    const r = fuzz(seed, 8000, holes);
    expect(r.failure, `${name} seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
    for (const [what, times] of Object.entries(r.done)) done[what] = (done[what] || 0) + times;
    for (const hole of Object.keys(r.visited)) visited.add(hole);
  }
  for (const hole of visited)
    expect(
      holes.map((h) => h.name),
      hole,
    ).toContain(hole);
  expect(visited.size, `${name}: a good many of its holes played`).toBeGreaterThanOrEqual(3);
  return done;
}

describe('the fuzzer', () => {
  // the lane and the island are each counted over both courses, as they were when the two were one test
  let lane = 0,
    island = 0;

  it('plays The Fells at random, every seed clean, the water and slope rules held throughout', () => {
    const done = played('The Fells', [1, 2, 3, 4, 11]);
    lane += done['drive the lane'] || 0;
    island += done['fly to an island'] || 0;
  });

  it('plays The Isles at random, every seed clean, the water and slope rules held throughout', () => {
    const done = played('The Isles', [1, 2, 3, 4]);
    lane += done['drive the lane'] || 0;
    island += done['fly to an island'] || 0;
  });

  it('drove along a lane through a wood and shot at an island, on one course or the other', () => {
    expect(lane, 'drives along a lane, slipped').toBeGreaterThan(0);
    expect(island, 'shots at an island').toBeGreaterThan(0);
  });
});
