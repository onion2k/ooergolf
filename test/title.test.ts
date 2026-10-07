/** When the title screen may leave: not before the game is ready, and not before it has been seen in full. */
import { describe, expect, it } from 'vitest';
import { TITLE, fades, leaveDelay } from '../src/title';

describe('the title screen', () => {
  it('fades in and out over a little over half a second each', () => {
    expect(TITLE.fadeIn).toBe(600);
    expect(TITLE.fadeOut).toBe(600);
    expect(fades(false)).toEqual({ fadeIn: 600, fadeOut: 600 });
  });

  it('has no fades for a player who asked for less motion', () => {
    expect(fades(true)).toEqual({ fadeIn: 0, fadeOut: 0 });
  });

  it('waits out the rest of the fade-in when the game is ready before it is over', () => {
    // shown at 1000 ms, ready at 1200: the fade-in ends at 1600, so the title stays 400 ms more
    expect(leaveDelay(1000, 1200, false)).toBe(400);
  });

  it('leaves at once when the game was ready after the fade-in was over', () => {
    expect(leaveDelay(1000, 1600, false)).toBe(0);
    expect(leaveDelay(1000, 5000, false)).toBe(0);
  });

  it('never gives a wait that is below nought or past the fade-in', () => {
    for (const ready of [-50, 0, 999, 1000, 1001, 1599, 1600, 1601, 9e6]) {
      const wait = leaveDelay(1000, ready, false);
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThanOrEqual(TITLE.fadeIn);
    }
  });

  it('leaves at once under reduced motion, whenever the game is ready', () => {
    expect(leaveDelay(1000, 1000, true)).toBe(0);
    expect(leaveDelay(1000, 1100, true)).toBe(0);
  });
});
