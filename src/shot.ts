/**
 * The shot as the player makes it: a drag anywhere on the screen, pulled
 * back and let go, turned into a direction on the course and a power. The
 * page hands in where the pointer went, on the screen and on the ground, and
 * gets back a shot or nothing; everything here is arithmetic, so it is
 * tested without a page.
 *
 * The direction comes from the ground, so a drag means the same on the
 * course whichever way the camera looks at it. The power comes from the
 * screen, as a share of its shorter side, so a drag is as strong on a phone
 * as on a desktop and does not depend on how far away the camera is.
 */
import type { Camera } from 'artshape-render/gpu/camera';

/** The drag, as shares of the screen's shorter side: the length of the hardest shot, and the least that is a shot at all. */
export const DRAG = { full: 0.35, dead: 0.04 };

export interface Shot {
  /** Which way, as an angle on the course from +x toward +y. */
  angle: number;
  /** How hard, from none to the club's hardest. */
  power: number;
}

type Px = readonly [number, number];
type Ground = readonly [number, number] | null;

/**
 * The shot a drag makes: from `press` to `now` on the screen, in pixels, and
 * the points on the ground under each. None for a drag too short to mean
 * anything, which is how a player takes a shot back, or for one with no
 * ground under it to take a direction from.
 */
export function shotFromDrag(
  press: Px,
  now: Px,
  pressGround: Ground,
  nowGround: Ground,
  shortSide: number,
): Shot | null {
  const length = Math.hypot(now[0] - press[0], now[1] - press[1]) / shortSide;
  if (length < DRAG.dead || !pressGround || !nowGround) return null;
  const dx = pressGround[0] - nowGround[0],
    dy = pressGround[1] - nowGround[1];
  if (dx === 0 && dy === 0) return null;
  return { angle: Math.atan2(dy, dx), power: Math.min(1, length / DRAG.full) };
}

/**
 * The point on the ground at height `z` that the camera shows at (nx, ny) in
 * normalised device coordinates, or null where that is sky. The camera must
 * have been updated, and has no roll or lens shift, which this game never
 * gives it.
 */
export function groundAt(camera: Camera, nx: number, ny: number, z: number): [number, number] | null {
  const [px, py, pz] = camera.position;
  const fx = camera.target[0] - px,
    fy = camera.target[1] - py,
    fz = camera.target[2] - pz;
  const fl = Math.hypot(fx, fy, fz);
  const right = camera.right,
    up = camera.up;
  const h = Math.tan((camera.fov * Math.PI) / 360);
  const dx = fx / fl + right[0] * nx * h * camera.aspect + up[0] * ny * h,
    dy = fy / fl + right[1] * nx * h * camera.aspect + up[1] * ny * h,
    dz = fz / fl + right[2] * nx * h * camera.aspect + up[2] * ny * h;
  // a ray level with the ground or rising never meets it
  if (dz > -1e-6) return null;
  const s = (z - pz) / dz;
  return [px + dx * s, py + dy * s];
}
