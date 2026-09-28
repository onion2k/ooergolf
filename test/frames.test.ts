/** The time between two drawn frames, as the page steps the game by it. */
import { describe, expect, it } from 'vitest';
import { LONGEST_STEP, between } from '../src/frames';

describe('the time between frames', () => {
  it('is the gap between their timestamps, in seconds, as the game is stepped by it', () => {
    const { gap, dt } = between(1016, 1000);
    expect(gap).toBe(16);
    expect(dt).toBeCloseTo(0.016, 9);
  });

  it('never steps the game back: a frame stamped before the last one, as the first after boot can be, is no time at all', () => {
    // the browser stamps a frame with when it began, which can be a moment before the page last read the clock
    expect(between(998.2, 1000)).toEqual({ gap: 0, dt: 0 });
  });

  it('steps the game no more than a twentieth of a second, however long the page was away', () => {
    expect(LONGEST_STEP).toBeCloseTo(1 / 20, 9);
    const away = between(6000, 1000);
    expect(away.dt).toBeCloseTo(LONGEST_STEP, 9);
    // the governor is told the gap as it was, and leaves out a stall itself
    expect(away.gap).toBe(5000);
  });
});
