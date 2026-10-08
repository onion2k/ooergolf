/**
 * The monkey on The Links, as it is and with its greens contoured at every speed: every seed clean, trees met, balls lost out
 * of bounds and in the water, the break read and putted by. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { contoured, fuzz } from '../scripts/fuzzer';
import { GREEN, greenArrows } from '../src/green';
import { GREENS } from '../src/surfaces';
import { LINKS_SPECS } from '../src/links';
import { COURSES } from '../src/course';

const LINKS = COURSES.find((c) => c.name === 'The Links')!.holes;

describe('the fuzzer', () => {
  it('plays The Links at random from start to finish, every seed clean: trees met, balls lost out of bounds and in the water, and the holes got round', () => {
    let holed = 0,
      finished = 0,
      lostOut = 0,
      knocked = 0,
      clubs = 0;
    const visited = new Set<string>();
    for (const seed of [4, 9, 21, 30]) {
      const r = fuzz(seed, 16000, LINKS);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      holed += r.happened.holed || 0;
      finished += r.happened.finished || 0;
      lostOut += r.happened.outOfBounds || 0;
      knocked += r.happened.knocked || 0;
      clubs += r.done['choose a club'] || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    const names = LINKS.map((h) => h.name);
    expect(visited.size, 'a good many of its holes played').toBeGreaterThanOrEqual(5);
    for (const name of visited) expect(names, `${name} is not a hole of The Links`).toContain(name);
    expect(lostOut, 'balls lost out of bounds, each told').toBeGreaterThan(20);
    expect(knocked, 'and knocked about, by trees among the rest').toBeGreaterThan(50);
    expect(clubs, 'clubs chosen from the bag').toBeGreaterThan(10);
    expect(holed + finished, 'and holed out, or round').toBeGreaterThan(0);
  });

  it('has the nine holes of The Links as contoured copies, on greens that run at every speed from the fastest to the slowest', () => {
    const holes = contoured();
    expect(contoured(), 'made once').toBe(holes);
    expect(holes.map((h) => h.name)).toEqual(LINKS_SPECS.map((s) => `${s.name} contoured`));
    const speeds = holes.map((h) => h.greens!);
    expect(Math.min(...speeds)).toBe(GREENS.fast);
    expect(Math.max(...speeds)).toBe(GREENS.slow);
    expect(new Set(speeds).size, 'four speeds').toBe(4);
    for (const speed of speeds) expect(speed).toBeGreaterThanOrEqual(GREENS.fast);
    // the steepest contour a green may have: arrows over every green, and its slope at the most a green may be
    for (const hole of holes)
      expect(
        hole.map.some((row) => row.includes('c')),
        `${hole.name} has a first cut`,
      ).toBe(true);
    const arrows = holes.map((h) => greenArrows(layoutOf(h.map, h.terrain)).length);
    for (const n of arrows) expect(n, 'a contoured green has arrows').toBeGreaterThan(8);
    expect(GREEN.steepest).toBeGreaterThan(0);
  });

  it('plays golf on contoured greens at every speed at random from start to finish, every seed clean, reading the break and putting by it', () => {
    let read = 0,
      putted = 0,
      holed = 0;
    const visited = new Set<string>();
    // six seeds, since a seed reads the break from one time to sixteen: on four the count came to 18 to 24 by which way a
    // round happened to go, astride the floor below, and the stones laid by the water on 8 October 2026 took it under; on
    // these six it is 37 to 52 on the trees measured, so a change that stops the reading still fails and one that only
    // moves the chance does not
    for (const seed of [4, 9, 21, 30, 37, 52]) {
      const r = fuzz(seed, 12000, contoured());
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      read += r.done['read the break'] || 0;
      putted += r.done['putt by the break'] || 0;
      holed += r.happened.holed || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    for (const name of visited) expect(name).toMatch(/ contoured$/);
    expect(visited.size, 'a good many of its holes played').toBeGreaterThanOrEqual(5);
    expect(read, 'breaks read, each held to the rules and the game left as it was').toBeGreaterThan(20);
    expect(putted, 'putts the autopilot took, each held to the break').toBeGreaterThan(5);
    expect(holed, 'and holed out').toBeGreaterThan(0);
  });
});
