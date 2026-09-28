/**
 * The ball squashed by a knock: flattened against what it met, along the
 * knock, at once, then sprung back, a little long for a moment on the way,
 * and round again within a tenth of a second. The harder the knock, the
 * deeper, to a most: a toy ball, not a water balloon. All from the game time
 * since the knock, so a picture taken at the same moment is the same
 * picture. Only drawing: the physics' ball is round throughout, and nothing
 * here is played. Without it, a ball banked hard off the rail would bounce
 * as a marble does, and read as one.
 */
import { KNOCK } from './arena';

/**
 * How long a squash lasts, in seconds; its deepest, as a share of the ball's
 * size along the knock; and how hard a knock must be, in units a second, to
 * squash it that deep. Softer knocks squash it less, down to nothing at the
 * softest a knock is.
 */
export const SQUASH = { lasts: 0.1, most: 0.3, full: 36 } as const;

/**
 * How squashed the ball is `since` seconds after a knock of `hard`: a share
 * of its size along the knock, deepest at the knock, a little under nought
 * as it springs back long, and nought from `lasts` on, exactly, as before the
 * knock.
 */
export function squash(since: number, hard: number): number {
  if (!(since >= 0) || since >= SQUASH.lasts) return 0;
  const deep = SQUASH.most * Math.max(0, Math.min(1, (hard - KNOCK.least) / (SQUASH.full - KNOCK.least)));
  const tau = since / SQUASH.lasts;
  // a spring's swing, a quarter and a half of it, dying into the end so it arrives round without a jolt
  return deep * (1 - tau) ** 2 * Math.cos(1.5 * Math.PI * tau);
}

/**
 * Placement `i` of `out`, a ball of radius `r` already placed there,
 * squashed by `s` along the unit (nx, ny, nz), the way the knock pushed it:
 * flattened against what it met, whose side of it stays where it is, and as
 * much wider across the knock as keeps it about as big. Squashed in the
 * world's directions, whatever way the ball has rolled. A squash of nought
 * leaves it exactly as it was.
 */
export function squashInto(out: Float32Array, i: number, s: number, nx: number, ny: number, nz: number, r: number) {
  if (s === 0) return;
  const along = 1 - s,
    across = 1 + s / 2;
  const o = i * 16;
  // each of the placement's three axes squashed: across it all, and along the knock by the rest
  for (let c = o; c < o + 12; c += 4) {
    const d = (along - across) * (nx * out[c] + ny * out[c + 1] + nz * out[c + 2]);
    out[c] = across * out[c] + d * nx;
    out[c + 1] = across * out[c + 1] + d * ny;
    out[c + 2] = across * out[c + 2] + d * nz;
  }
  // what it met touches it on the side the knock came from, and that side stays put: the middle comes toward it
  out[o + 12] -= r * s * nx;
  out[o + 13] -= r * s * ny;
  out[o + 14] -= r * s * nz;
}

/**
 * How squashed placement `i` of `out` is along the unit (nx, ny, nz), read
 * back from the placement itself: one less its length that way, which a turn
 * does not change. To a hundred-thousandth, as far as its floats are exact,
 * so a ball drawn round reads as nought. For a test to see what was drawn.
 */
export function squashOf(out: Float32Array, i: number, nx: number, ny: number, nz: number): number {
  const o = i * 16;
  let along = 0;
  for (let c = o; c < o + 12; c += 4) along += (nx * out[c] + ny * out[c + 1] + nz * out[c + 2]) ** 2;
  const s = 1 - Math.sqrt(along);
  return Math.abs(s) < 1e-5 ? 0 : s;
}

/**
 * The page's squash: the last knock, when in game time, how hard and which
 * way. One at a time, each knock in place of the last, and forgotten when a
 * hole begins or the ball is put back, so nothing is kept past its end.
 */
export class Squash {
  private at = -Infinity;
  private hard = 0;
  /** Which way the last knock pushed the ball. */
  readonly along = new Float32Array([0, 0, 1]);

  /** A knock at game time `t`, `hard` units a second, pushing the ball along (dx, dy, dz). */
  knock(t: number, hard: number, dx: number, dy: number, dz: number) {
    this.at = t;
    this.hard = hard;
    this.along[0] = dx;
    this.along[1] = dy;
    this.along[2] = dz;
  }

  /** The knock forgotten: a new ball, or a new hole. */
  clear() {
    this.at = -Infinity;
  }

  /** How squashed the ball is at game time `t`. */
  amount(t: number): number {
    return squash(t - this.at, this.hard);
  }
}
