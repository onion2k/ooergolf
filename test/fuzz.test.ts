/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    // two seeds, since which of the rarer things a monkey gets round to on one is chance. A reload starts the round
    // again, the save not yet keeping where in the course a player is, so a round is seldom finished: 17 and 40 do,
    // chosen again when a course could be chosen, and each does everything a player can
    const one = fuzz(17, 12000),
      two = fuzz(40, 12000);
    const sum = (a: Record<string, number>, b: Record<string, number>) => {
      const out = { ...a };
      for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
      return out;
    };
    expect(one.failure, JSON.stringify(one.failure)).toBe(null);
    expect(two.failure, JSON.stringify(two.failure)).toBe(null);
    const r = { done: sum(one.done, two.done), happened: sum(one.happened, two.happened), failure: null };
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    const actions = [
      'buy',
      'buy, refused',
      'choose a course',
      'equip',
      'play again',
      'reload',
      'shoot',
      'shoot well',
      'shoot while rolling',
      'wait',
    ];
    expect(Object.keys(r.done).sort(), 'every action there is, and no other').toEqual(actions);
    for (const action of actions) expect(r.done[action], action).toBeGreaterThan(0);
    expect(r.happened.struck, 'the ball struck').toBe(r.done.shoot + r.done['shoot well']);
    expect(r.happened.stopped, 'and come to rest').toBeGreaterThan(0);
    expect(r.happened.holed, 'holed out').toBeGreaterThan(0);
    expect(r.happened.finished, 'round the whole course').toBeGreaterThan(0);
    expect(r.happened.knocked, 'knocked off the rail and the rest, each knock told as a knock is').toBeGreaterThan(0);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
