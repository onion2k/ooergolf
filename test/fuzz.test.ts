/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { WINDY, contoured, fuzz } from '../scripts/fuzzer';
import { GREEN, greenArrows } from '../src/green';
import { GREENS } from '../src/surfaces';
import { LINKS_SPECS } from '../src/links';
import { DOWNS, moors } from '../src/course';
import { COURSES } from '../src/course';
import { RANGE } from '../src/range';

const MOORS = moors();
const LINKS = COURSES.find((c) => c.name === 'The Links')!.holes;

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    // two seeds, since which of the rarer things a monkey gets round to on one is chance. A reload starts the round
    // again, the save not yet keeping where in the course a player is, so a round is seldom finished: 26 and 17 do (they were 25 and 33 until The Range was chosen from among the courses, which moved what a monkey picks),
    // chosen again when a course could be chosen, and each does everything a player can
    // and a run of the range, which is golf: the green is read, and a putt held to the break, there as on any golf hole; the club chosen from the bag is an action of its own, done only there, and so is the
    // aiming of a shot, whose preview is held to the game, and the shot then taken as it was aimed
    const one = fuzz(26, 12000),
      two = fuzz(17, 12000),
      golf = fuzz(3, 8000, RANGE);
    const sum = (a: Record<string, number>, b: Record<string, number>) => {
      const out = { ...a };
      for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
      return out;
    };
    expect(one.failure, JSON.stringify(one.failure)).toBe(null);
    expect(two.failure, JSON.stringify(two.failure)).toBe(null);
    expect(golf.failure, JSON.stringify(golf.failure)).toBe(null);
    const r = {
      done: sum(sum(one.done, two.done), golf.done),
      happened: sum(sum(one.happened, two.happened), golf.happened),
      failure: null,
    };
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    const actions = [
      'aim a shot',
      'buy',
      'buy, refused',
      'choose a club',
      'choose a course',
      'equip',
      'face the flag',
      'look round',
      'play again',
      'putt by the break',
      'read the break',
      'reload',
      'shoot',
      'shoot as aimed',
      'shoot well',
      'shoot while rolling',
      'wait',
    ];
    expect(Object.keys(r.done).sort(), 'every action there is, and no other').toEqual(actions);
    for (const action of actions) expect(r.done[action], action).toBeGreaterThan(0);
    expect(r.happened.struck, 'the ball struck').toBe(r.done.shoot + r.done['shoot well'] + r.done['shoot as aimed']);
    expect(r.happened.stopped, 'and come to rest').toBeGreaterThan(0);
    expect(r.happened.holed, 'holed out').toBeGreaterThan(0);
    expect(r.happened.finished, 'round the whole course').toBeGreaterThan(0);
    expect(r.happened.knocked, 'knocked off the rail and the rest, each knock told as a knock is').toBeGreaterThan(0);
  });

  it('plays The Range at random from start to finish, every seed clean, every club struck, every landing told as one is', () => {
    let holed = 0,
      finished = 0,
      landed = 0,
      clubs = 0;
    const visited = new Set<string>();
    for (const seed of [4, 9, 21, 30]) {
      const r = fuzz(seed, 12000, RANGE);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      holed += r.happened.holed || 0;
      finished += r.happened.finished || 0;
      landed += r.happened.landed || 0;
      clubs += r.done['choose a club'] || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    expect([...visited].sort()).toEqual(RANGE.map((h) => h.name).sort());
    expect(landed, 'balls come down, each landing told and checked as it is').toBeGreaterThan(50);
    expect(clubs, 'and clubs chosen from the bag').toBeGreaterThan(10);
    expect(holed, 'holed out').toBeGreaterThan(0);
    expect(finished, 'round the whole course').toBeGreaterThan(0);
  });

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

  it('plays golf in a wind at random from start to finish, every seed clean, aims and strokes taken with a shape and a spin chosen', () => {
    let aimed = 0,
      struck = 0,
      holed = 0,
      landed = 0;
    const visited = new Set<string>();
    for (const seed of [4, 9, 21, 30]) {
      const r = fuzz(seed, 12000, WINDY);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      aimed += r.done['aim a shot'] || 0;
      struck += (r.done.shoot || 0) + (r.done['shoot well'] || 0) + (r.done['shoot as aimed'] || 0);
      holed += r.happened.holed || 0;
      landed += r.happened.landed || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    // the holes it played are the windy ones, and so the wind was on the games it played
    expect(WINDY.map((h) => h.wind)).toEqual([12, 18, 6]);
    expect([...visited].sort()).toEqual(WINDY.map((h) => h.name).sort());
    for (const name of visited) expect(name).toMatch(/ windy$/);
    expect(aimed, 'shots aimed in the wind, each preview held to the game').toBeGreaterThan(20);
    expect(struck, 'and shots struck').toBeGreaterThan(20);
    expect(landed, 'balls come down in it, each landing told').toBeGreaterThan(50);
    expect(holed, 'and holed out').toBeGreaterThan(0);
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
    for (const seed of [4, 9, 21, 30]) {
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

  it('plays The Downs at random from start to finish, every seed clean, holing out and getting round all nine', () => {
    // the whole of the run on the course, not a share of it: nine long holes of noise, struck any way at any power
    let holed = 0,
      finished = 0,
      knocked = 0;
    const visited = new Set<string>();
    for (const seed of [17, 40, 3, 8]) {
      const r = fuzz(seed, 12000, DOWNS);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      holed += r.happened.holed || 0;
      finished += r.happened.finished || 0;
      knocked += r.happened.knocked || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    const names = DOWNS.map((h) => h.name);
    expect(visited.size, 'a good many of its holes played').toBeGreaterThanOrEqual(5);
    for (const name of visited) expect(names, `${name} is not a hole of The Downs`).toContain(name);
    expect(holed, 'holed out').toBeGreaterThan(0);
    expect(finished, 'round the whole course').toBeGreaterThan(0);
    expect(knocked, 'and knocked about, on ground that rises and falls').toBeGreaterThan(0);
  });

  it('plays The Moors at random from start to finish, every seed clean, holing out and getting round all nine', () => {
    // holes a hundred units and more from tee to cup, where a monkey striking any way at any power is many strokes from the
    // cup and the limit takes it up often: a longer run, and seeds that go the whole way round
    let holed = 0,
      finished = 0,
      knocked = 0,
      pickedUp = 0;
    const visited = new Set<string>();
    for (const seed of [25, 26, 17, 40]) {
      const r = fuzz(seed, 20000, MOORS);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      holed += r.happened.holed || 0;
      finished += r.happened.finished || 0;
      knocked += r.happened.knocked || 0;
      pickedUp += r.happened.pickedUp || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    const names = MOORS.map((h) => h.name);
    expect(visited.size, 'a good many of its holes played').toBeGreaterThanOrEqual(5);
    for (const name of visited) expect(names, `${name} is not a hole of The Moors`).toContain(name);
    expect(holed, 'holed out').toBeGreaterThan(0);
    expect(pickedUp, 'and picked up at the limit, as a long hole often takes a monkey').toBeGreaterThan(0);
    expect(finished, 'round the whole course').toBeGreaterThan(0);
    expect(knocked, 'and knocked about').toBeGreaterThan(0);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
