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
 * What of a camera the ground under a pixel is worked out from: where it is, where it looks and its lens. A `Camera`
 * is one, and so is a `ViewFrame` that has been copied from one, which does not move when the camera does.
 */
export interface View {
  readonly position: ArrayLike<number>;
  readonly target: ArrayLike<number>;
  readonly right: ArrayLike<number>;
  readonly up: ArrayLike<number>;
  readonly fov: number;
  readonly aspect: number;
}

/** A view copied out of a camera, written into again and again and made once. */
export class ViewFrame implements View {
  readonly position: [number, number, number] = [0, 0, 0];
  readonly target: [number, number, number] = [0, 0, 1];
  readonly right: [number, number, number] = [1, 0, 0];
  readonly up: [number, number, number] = [0, 0, 1];
  fov = 40;
  aspect = 1;

  /** Copied from `camera`, which must have been updated. */
  copy(camera: View) {
    for (let k = 0; k < 3; k++) {
      this.position[k] = camera.position[k];
      this.target[k] = camera.target[k];
      this.right[k] = camera.right[k];
      this.up[k] = camera.up[k];
    }
    this.fov = camera.fov;
    this.aspect = camera.aspect;
  }
}

/**
 * The view as it was when a drag began, kept still for the whole of it. The aim is the ground under the finger through
 * the camera, and the camera turns to face the aim (the director does it): read through the camera that is turning, the
 * ground under a still finger would move, and the aim with it, and the camera would chase its own tail. Read through
 * this, the aim depends on the drag and the view at its start and on nothing the camera does after.
 */
export class HeldView {
  readonly frame = new ViewFrame();

  /** The view held as it is now: `camera` must have been updated. */
  hold(camera: View) {
    this.frame.copy(camera);
  }

  /** The point on the ground at height `z` that the held view shows at (nx, ny), as `groundAt` finds it. */
  ground(nx: number, ny: number, z: number, out: [number, number] = [0, 0]): [number, number] | null {
    return groundAt(this.frame, nx, ny, z, out);
  }
}

/**
 * The point on the ground at height `z` that the view shows at (nx, ny) in
 * normalised device coordinates, or null where that is sky, written into `out`
 * (made for the caller unless it gives one, which a frame does). A camera must
 * have been updated, and has no roll or lens shift, which this game never
 * gives it.
 */
export function groundAt(
  camera: View,
  nx: number,
  ny: number,
  z: number,
  out: [number, number] = [0, 0],
): [number, number] | null {
  const px = camera.position[0],
    py = camera.position[1],
    pz = camera.position[2];
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
  out[0] = px + dx * s;
  out[1] = py + dy * s;
  return out;
}
