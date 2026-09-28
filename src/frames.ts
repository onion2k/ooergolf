/**
 * The time between two drawn frames, and how far the game is stepped by it.
 * A frame's timestamp is when the browser began it, which for the first
 * after boot can be a moment before the page last read the clock: taken as
 * it came, that gap was negative, the game stepped back, and its clock read
 * below nought. And a page hidden for a while comes back to one long gap,
 * which the game takes as no more than a twentieth of a second, so a ball
 * does not leap. The gap itself goes to the governor, which leaves out a
 * stall on its own account.
 */

/** The most a single frame steps the game, in seconds. */
export const LONGEST_STEP = 1 / 20;

/** The gap from the last frame's timestamp to this one's, in milliseconds, never less than none; and the step it gives, in seconds. */
export function between(now: number, last: number): { gap: number; dt: number } {
  const gap = Math.max(0, now - last);
  return { gap, dt: Math.min(gap / 1000, LONGEST_STEP) };
}
