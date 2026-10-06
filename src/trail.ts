/**
 * The glow ball's trail: where the ball has been lately, as a fixed ring of places stamped with the game time they were
 * made at, written out each frame as the renderer's sprites that fade and shrink with age. All from game time, so a
 * picture is the same every run, and nothing is made in a frame: the ring is sized once and the sprites are written
 * into a buffer the page owns. Without it, the item would have to keep a list of the ball's path that grows for as long
 * as it flies, and a ball that stopped would leave the trail standing still.
 */
import type { Colour } from './models/part';

/**
 * The trail: at most `most` places, each lasting `lasts` seconds of game time (48 frames at sixty a second, so the ring
 * is full only for the length of life it has), a sprite `size` times the ball's radius at its newest and a third of that
 * at its oldest, and as solid as `alpha` at its newest. A place is made when the ball has moved `apart` from the last, and only while it goes faster than `moving` a second (the page asks).
 */
export const TRAIL = { most: 48, lasts: 0.8, size: 1.05, alpha: 0.55, apart: 0.02, moving: 0.3 } as const;

/** Floats a sprite has in the renderer's buffer: where, how big, what colour and how solid. */
export const SPRITE_FLOATS = 8;

export class Trail {
  readonly capacity = TRAIL.most;
  readonly x = new Float32Array(TRAIL.most);
  readonly y = new Float32Array(TRAIL.most);
  readonly z = new Float32Array(TRAIL.most);
  /** The game time each place was made at. */
  readonly at = new Float64Array(TRAIL.most);
  /** How many places are held, and where the next is written. */
  count = 0;
  /** Where the next place is written: public to `trailInto`, which reads the ring from the newest back. */
  head = 0;

  /** Every place forgotten: a new hole, or a ball put back, so no trail joins two places the ball did not travel between. */
  clear() {
    this.count = 0;
    this.head = 0;
  }

  /**
   * The ball at (x, y, z) at game time `t`, written if it has moved since the last place or the clock has been put back
   * (a new round); not for a ball at rest, nor for a moment drawn again. Whether a place was made.
   */
  record(t: number, x: number, y: number, z: number): boolean {
    if (this.count > 0) {
      const last = (this.head + TRAIL.most - 1) % TRAIL.most;
      if (t < this.at[last]) this.clear();
      else if (t === this.at[last] || Math.hypot(x - this.x[last], y - this.y[last], z - this.z[last]) < TRAIL.apart)
        return false;
    }
    const h = this.head;
    this.x[h] = x;
    this.y[h] = y;
    this.z[h] = z;
    this.at[h] = t;
    this.head = (h + 1) % TRAIL.most;
    if (this.count < TRAIL.most) this.count++;
    return true;
  }
}

/**
 * The sprites of the trail at game time `t` into `out`, newest first, the ball's `radius` being what the size is of: how
 * many were written. A place is as solid as `alpha` when it is made, thins by the square of its age over `lasts`, and is
 * not written at all from `lasts` on, exactly. `out` need hold no more than `TRAIL.most` sprites.
 */
export function trailInto(out: Float32Array, trail: Trail, t: number, radius: number, colour: Colour): number {
  let n = 0;
  for (let j = 0; j < trail.count; j++) {
    const i = (trail.head - 1 - j + TRAIL.most) % TRAIL.most;
    const age = (t - trail.at[i]) / TRAIL.lasts;
    // the places are in order of age, so the first too old ends it; a time before a place is as new as it
    if (age >= 1) break;
    const fresh = 1 - Math.max(0, age);
    const o = n * SPRITE_FLOATS;
    out[o] = trail.x[i];
    out[o + 1] = trail.y[i];
    out[o + 2] = trail.z[i];
    out[o + 3] = radius * TRAIL.size * (1 / 3 + (2 / 3) * fresh);
    out[o + 4] = colour[0];
    out[o + 5] = colour[1];
    out[o + 6] = colour[2];
    out[o + 7] = TRAIL.alpha * fresh * fresh;
    n++;
  }
  return n;
}

/**
 * Whether the trail is drawn: the item is held and the picture is on a rung of the quality ladder that draws particles
 * (`rung` is what the ladder takes away at that rung). The renderer gives sprites up with its particles, and a machine too
 * slow for them has no room for a glow, so the trail is not even written there.
 */
export function trailDrawn(held: boolean, rung: { particles?: boolean }): boolean {
  return held && rung.particles !== false;
}
