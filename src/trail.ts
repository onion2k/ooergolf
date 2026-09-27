/**
 * The track a ball leaves in the grass: a streak of pressed turf behind it as
 * it rolls, darker than the grass, fading back to it over a few seconds. It
 * is only drawing, kept by the page, and changes nothing that is played.
 *
 * The renderer draws nothing see-through, so the track is a chain of thin
 * flat strips laid on the grass, each recoloured from dark toward the turf
 * under it as it ages, and taken again for a new strip once it has faded:
 * the track is held to `capacity` strips, the oldest reused first, and
 * emptied when a hole begins.
 */
import { BALL, KIND_RADIUS, tileAt } from './arena';
import { CUP } from './course';
import type { Game } from './game';

/**
 * How the track is laid: how many strips it can hold, how far the ball goes
 * before another is laid, how long one takes to fade, how wide it is, and how
 * much darker than the turf it starts: pressed grass, not a stain.
 */
export const TRAIL = { capacity: 240, spacing: 0.5, fade: 6, width: 0.9, dark: 0.7 } as const;

export class Trail {
  /** Each strip's middle, its height, which way it runs, how long it is, and when it was laid, in game time. */
  readonly x = new Float32Array(TRAIL.capacity);
  readonly y = new Float32Array(TRAIL.capacity);
  readonly z = new Float32Array(TRAIL.capacity);
  readonly yaw = new Float32Array(TRAIL.capacity);
  readonly length = new Float32Array(TRAIL.capacity);
  readonly born = new Float32Array(TRAIL.capacity);
  /** How many strips there are, and where the next goes. */
  count = 0;
  private next = 0;
  /** Where the last strip ended, from which the next begins; none after a lift. */
  private from: { x: number; y: number } | null = null;

  /** The ball at (x, y), on grass at height z, at game time t: a strip laid, if it has come far enough since the last. */
  lay(x: number, y: number, z: number, t: number) {
    if (!this.from) {
      this.from = { x, y };
      return;
    }
    const dx = x - this.from.x,
      dy = y - this.from.y;
    const d = Math.hypot(dx, dy);
    if (d < TRAIL.spacing) return;
    const i = this.next;
    this.x[i] = (x + this.from.x) / 2;
    this.y[i] = (y + this.from.y) / 2;
    this.z[i] = z;
    this.yaw[i] = Math.atan2(dy, dx);
    this.length[i] = d;
    this.born[i] = t;
    this.next = (this.next + 1) % TRAIL.capacity;
    this.count = Math.min(TRAIL.capacity, this.count + 1);
    this.from = { x, y };
  }

  /** The ball off the grass, or gone: the track is broken here, and the next strip begins afresh. */
  lift() {
    this.from = null;
  }

  /** Every strip gone, for a hole begun. */
  clear() {
    this.count = 0;
    this.next = 0;
    this.from = null;
  }

  /** How dark strip `i` is at game time `t`: 1 as it is laid, down to 0 when it has faded. */
  shade(i: number, t: number): number {
    const age = t - this.born[i];
    return age >= TRAIL.fade ? 0 : Math.max(0, 1 - age / TRAIL.fade);
  }
}

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
  const floor = layout.floor[t];
  // on the grass: its middle a radius above it, or near enough. Water's floor is far below the ball, so over water it
  // never is; and not crossing the cup, whose middle has no grass
  if (Math.abs(world.z[ball] - floor - KIND_RADIUS[BALL]) > 0.15) return null;
  if (Math.hypot(x - layout.cup.x, y - layout.cup.y) < CUP.radius) return null;
  if (Math.hypot(world.vx[ball], world.vy[ball]) < 0.3) return null;
  return { x, y, z: floor };
}
