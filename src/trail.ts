/**
 * The track a ball leaves in the grass: where it presses the blades down as
 * it rolls. The renderer keeps the pressed grass and stands it again over a
 * few seconds; this says only where the ball is pressing it, and how wide.
 * It is only drawing, and changes nothing that is played. Without it the
 * ball would press the grass in the air, over water and across the cup.
 */
import { BALL, KIND_RADIUS, heightAt, restingAbove, tileAt } from './arena';
import { CUP } from './course';
import type { Game } from './game';

/**
 * How wide a disc the ball presses: flat inside half of it and softening to
 * nothing at its edge, so a little under the ball's own radius gives a track
 * the ball's width, soft at its sides.
 */
export const PRESS_RADIUS = 0.9 * KIND_RADIUS[BALL];

/**
 * Where the ball is leaving a track, if it is: rolling on the grass, not
 * over water, not in the air, and not in the cup. The point on the grass
 * under it, and the grass's height there.
 */
export function trailFrom(game: Game): { x: number; y: number; z: number } | null {
  const { world, ball, layout } = game;
  if (!world.alive[ball]) return null;
  const x = world.x[ball],
    y = world.y[ball];
  const t = tileAt(layout, x, y);
  if (t < 0 || layout.solid[t]) return null;
  const floor = heightAt(layout, x, y);
  // on the grass: its middle a radius above it, or a little more on a slope, or near enough. Water's floor is far below
  // the ball, so over water it never is; and not crossing the cup, whose middle has no grass
  if (Math.abs(world.z[ball] - floor - restingAbove(layout, x, y, KIND_RADIUS[BALL])) > 0.15) return null;
  if (Math.hypot(x - layout.cup.x, y - layout.cup.y) < CUP.radius) return null;
  if (Math.hypot(world.vx[ball], world.vy[ball]) < 0.3) return null;
  return { x, y, z: floor };
}
