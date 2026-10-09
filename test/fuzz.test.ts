/**
 * The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. This file has the courses
 * a player chooses among and golf on level holes, in calm and in wind; The Links, plain and contoured, are in
 * `fuzz-links.test.ts` and The Fells and The Isles in `fuzz-fells-isles.test.ts`. They are three files so that none is more
 * than about half a minute of work on a slow machine. The tests are synchronous, so the worker reads nothing the run says to
 * it until a file is done, and when what it sent at the file's first test has gone unanswered for a minute vitest ends the
 * run with an unhandled error, `Timeout calling "onTaskUpdate"`, and a failure with every test passed. What the monkey is
 * taught to play next goes in a file of its own, and not on to the end of one of these.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import type { HoleDef } from '../src/course';
import { FLAT_HOLES } from './helpers';

/**
 * The level holes of the helpers with a wind on them, of 12, 18 and 6 miles an hour in turn, under names of their own: where
 * the monkey plays golf in stronger wind than any hole of The Links has (4 to 12), which `npm run fuzz` no longer plays.
 */
const WINDS = [12, 18, 6] as const;
const WINDY: readonly HoleDef[] = FLAT_HOLES.map((hole, k) => ({
  ...hole,
  name: `${hole.name} windy`,
  wind: WINDS[k % WINDS.length],
}));

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    // two seeds, since which of the rarer things a monkey gets round to on one is chance. A reload starts the round
    // again, the save not yet keeping where in the course a player is, so a round is seldom finished: 26 and 17 do (they were 25 and 33 until a golf course was chosen from among the courses, which moved what a monkey picks),
    // chosen again when a course could be chosen, and each does everything a player can
    // and a run of level golf holes: the green is read, and a putt held to the break, there as on any golf hole; the club chosen from the bag is an action of its own, done only there, and so is the
    // aiming of a shot, whose preview is held to the game, and the shot then taken as it was aimed
    const one = fuzz(26, 12000),
      two = fuzz(17, 12000),
      golf = fuzz(3, 8000, FLAT_HOLES),
      // 'fly to an island' needs a hole with land wholly in water (The Links' Island Green, The Isles), and 26, 17 and 3 reach
      // none since the ground is read by the zones and the stones are gone (9 October 2026: their rounds go another way);
      // seed 7 reaches one three times in 12000 frames, and is the cheapest chosen (a second), with no bearing on the draws below
      island = fuzz(7, 12000);
    const sum = (a: Record<string, number>, b: Record<string, number>) => {
      const out = { ...a };
      for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
      return out;
    };
    // a ball come to rest on golf was held to the zones' lie each time, and a good many came to rest: a check that never ran passes in silence
    expect(golf.checked['lie at rest'], 'balls at rest held to the zones').toBeGreaterThan(30);
    // the monkey's main stream is drawn from exactly this often: every other action keeps to a stream of its own, so a
    // stray draw anywhere (a new action reading the monkey's chance, say) moves these and not only what is done. Recorded
    // on 6 October 2026 before 'aim and take back' was added, and it must not move with it. Seed 17's moved from 3217 to 3100 when the
    // putters were replaced by items (the shop's actions draw the same, but a monkey that can no longer buy a harder putter
    // plays a different round on minigolf); seeds 26 and 3 did not move. Seed 3's (level golf) moved from 2670 to 2702 when the play items
    // began to act, since the monkey buys and equips them and plays on with one held (with every effect off it is 2670 again).
    // Seed 3's went back from 2702 to 2670 on 8 October 2026 when the eighteen play items were withdrawn: with every effect off
    // it is the 2670 it was before they acted, and the kit's shop (whose figures act through the kit alone) leaves it there.
    // Seed 26's moved from 3296 to 3142 when The Fair went on 8 October 2026, its best holes shared between the Shed and the
    // Waterworks: a monkey choosing among six courses, and playing their holes in a new order, plays another round; 17 and 3
    // did not move. Seeds 26 and 17 moved again, to 3140 and 3202, when stones that the ball meets were laid along the water's
    // edge off each hole's line of play (8 October 2026): the rounds are played differently where a ball comes back off one.
    // They went back to 3142 and 3100 on 9 October 2026 when those stones went, the ring along the water being scenery only
    // (and the action that rolled at one with them, which drew from a stream of its own and so moved nothing here).
    // Seed 3's (level golf) moved from 2670 to 2702 on 9 October 2026 when a golf ball's lie began to be read from the curves the
    // ground is drawn by (`zones.ts`) and not the tile: shown by putting `lieAt` and `isOut` back to the tile's in a scratch
    // edit, which gives 2670 to the draw (the fuzzer's `aimed` fix, tried alone, leaves 2702): the rounds on a hole's edges differ.
    expect([one.drawn, two.drawn, golf.drawn], "draws from the monkey's main stream").toEqual([3142, 3100, 2702]);
    // the framing rule was asked of the camera, on golf and on minigolf, a good many times: a check that never ran passes in silence
    expect(one.framed + two.framed, 'times the framing was checked').toBeGreaterThan(300);
    expect(golf.framed, 'times it was checked on level golf').toBeGreaterThan(30);
    expect(one.failure, JSON.stringify(one.failure)).toBe(null);
    expect(two.failure, JSON.stringify(two.failure)).toBe(null);
    expect(golf.failure, JSON.stringify(golf.failure)).toBe(null);
    expect(island.failure, JSON.stringify(island.failure)).toBe(null);
    const r = {
      done: sum(sum(sum(one.done, two.done), golf.done), island.done),
      happened: sum(sum(sum(one.happened, two.happened), golf.happened), island.happened),
      failure: null,
    };
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    const actions = [
      'aim a shot',
      'aim and take back',
      'buy',
      'buy, refused',
      'choose a club',
      'choose a course',
      'equip',
      'face the flag',
      'fly to an island',
      'line up a putt',
      'look from overhead',
      'play again',
      'putt by the break',
      'read the break',
      'reload',
      'shoot',
      'shoot as aimed',
      'shoot well',
      'shoot while rolling',
      'unequip',
      'wait',
    ];
    expect(Object.keys(r.done).sort(), 'every action there is, and no other').toEqual(actions);
    for (const action of actions) expect(r.done[action], action).toBeGreaterThan(0);
    expect(r.happened.struck, 'the ball struck').toBe(
      r.done.shoot + r.done['shoot well'] + r.done['shoot as aimed'] + r.done['fly to an island'],
    );
    expect(r.happened.stopped, 'and come to rest').toBeGreaterThan(0);
    expect(r.happened.holed, 'holed out').toBeGreaterThan(0);
    expect(r.happened.finished, 'round the whole course').toBeGreaterThan(0);
    expect(r.happened.knocked, 'knocked off the rail and the rest, each knock told as a knock is').toBeGreaterThan(0);
  });

  it('plays level golf holes at random from start to finish, every seed clean, every club struck, every landing told as one is', () => {
    let holed = 0,
      finished = 0,
      landed = 0,
      clubs = 0;
    const visited = new Set<string>();
    // a seed starts on the hole its number comes to over the five, so five in a row begin on each of them; the monkey
    // reloads now and then, which starts a round again, and of these only 32 gets from the last hole to the card
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 32]) {
      const r = fuzz(seed, 12000, FLAT_HOLES);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      holed += r.happened.holed || 0;
      finished += r.happened.finished || 0;
      landed += r.happened.landed || 0;
      clubs += r.done['choose a club'] || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    expect(visited.size, 'a good many of the holes played').toBeGreaterThanOrEqual(3);
    for (const name of visited)
      expect(
        FLAT_HOLES.map((h) => h.name),
        name,
      ).toContain(name);
    expect(landed, 'balls come down, each landing told and checked as it is').toBeGreaterThan(50);
    expect(clubs, 'and clubs chosen from the bag').toBeGreaterThan(10);
    expect(holed, 'holed out').toBeGreaterThan(0);
    expect(finished, 'round the whole course').toBeGreaterThan(0);
  });

  it('plays golf in a wind at random from start to finish, every seed clean, aims and strokes taken with a shape and a spin chosen', () => {
    let aimed = 0,
      struck = 0,
      holed = 0,
      landed = 0;
    const visited = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const r = fuzz(seed, 12000, WINDY);
      expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
      aimed += r.done['aim a shot'] || 0;
      struck += (r.done.shoot || 0) + (r.done['shoot well'] || 0) + (r.done['shoot as aimed'] || 0);
      holed += r.happened.holed || 0;
      landed += r.happened.landed || 0;
      for (const name of Object.keys(r.visited)) visited.add(name);
    }
    // the holes it played are the windy ones, and so the wind was on the games it played
    expect(WINDY.map((h) => h.wind)).toEqual(FLAT_HOLES.map((_, k) => WINDS[k % WINDS.length]));
    expect(
      WINDY.every((h) => h.wind! > 0),
      'none of them calm',
    ).toBe(true);
    expect(visited.size, 'a good many of the holes played').toBeGreaterThanOrEqual(3);
    for (const name of visited) expect(name).toMatch(/ windy$/);
    expect(aimed, 'shots aimed in the wind, each preview held to the game').toBeGreaterThan(20);
    expect(struck, 'and shots struck').toBeGreaterThan(20);
    expect(landed, 'balls come down in it, each landing told').toBeGreaterThan(50);
    expect(holed, 'and holed out').toBeGreaterThan(0);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
