/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    const r = fuzz(1, 1500);
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    expect(Object.keys(r.done).sort(), 'every action there is, and no other').toEqual(['reload', 'wait']);
    for (const action of ['wait', 'reload']) expect(r.done[action], action).toBeGreaterThan(0);
    expect(r.happened, 'nothing happens on an empty course').toEqual({});
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
