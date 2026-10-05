/**
 * Whether a tile's ground holds a ball, and how much of a hole's fairway does not: a leaf of arithmetic over a layout, the
 * one place the rule is written. A ball rests where the slope's pull along the ground, which is the slope over the root of
 * one and its square, is no more than its lie's roll holds against gravity (97 in a hundred of it, so a ball is not left
 * on the very edge of rolling). The generator asks it of a hole it is making, and a test or a course's gate asks how much
 * of a hole's fairway is ground a ball runs down; without one place for it the two would drift apart.
 */
import { PHYSICS, TILE, slopeAt, type Layout } from './arena';
import { LIE, rollOf } from './surfaces';

/** Whether tile `t` of the layout, of a lie that is not solid or out of bounds, is ground its lie holds a ball on, on greens that run at `greens` (the normal speed if left out). */
export function holdsBall(l: Layout, t: number, greens?: number): boolean {
  const [sx, sy] = slopeAt(
    l,
    l.originX + ((t % l.cols) + 0.5) * TILE,
    l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
  );
  const s = Math.hypot(sx, sy);
  return (
    s / Math.sqrt(1 + s * s) <= (0.97 * rollOf(l.lie[t] as Parameters<typeof rollOf>[0], greens)) / PHYSICS.gravity
  );
}

/** The share of a hole's fairway tiles whose slope the fairway does not hold a ball on: nought for ground a ball rests on everywhere, and nought for a hole with no fairway. */
export function runningShare(l: Layout, greens?: number): number {
  let fairway = 0,
    running = 0;
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (l.solid[t] || l.oob[t] || l.lie[t] !== LIE.fairway) continue;
    fairway++;
    if (!holdsBall(l, t, greens)) running++;
  }
  return fairway === 0 ? 0 : running / fairway;
}
