/**
 * The camera: three-quarters from above, looking up the course from the tee
 * end, following the ball. It eases after the ball rather than jumping, so a
 * shot is watched and not cut to, and the wheel can bring it nearer or take
 * it further within limits. It looks a little ahead of the ball, up the
 * course. On a screen taller than it is wide it stands further back, though
 * not so far that the whole width fits: a phone shows the way ahead large and
 * the far sides of the course less, since it follows the ball anyway.
 *
 * It only says where the camera is; the page hands it the renderer's camera
 * to place, and nothing here draws.
 */
import type { Camera } from 'artshape-render/gpu/camera';

/** How it looks: the lens, how far down it looks from level, and how far back it stands at each end of the zoom. */
const VIEW = { fov: 40, polar: 0.78, near: 30, far: 110, home: 62 };
/** How quickly it catches up with the ball: the share of the way it goes in a second, as a rate. */
const EASE = 4;
/** How much wider than tall a screen must be before it needs no more room: below this, the camera stands back. */
const WIDE = 1.25;
/**
 * How far up the course from the ball it looks, so the ball sits low on the
 * screen with the way ahead above it, and not in the middle of the rough
 * behind the tee.
 */
const LEAD = 10;

export class CameraRig {
  readonly fov = VIEW.fov;
  /** Where it looks, on the ground. */
  readonly target: [number, number, number] = [0, 0, 0];
  /** How far back it stands, before a tall screen pushes it further. */
  distance: number = VIEW.home;

  /** Straight to looking at (x, y) on ground `z` high, without easing: for the start of a hole. */
  jump(x: number, y: number, z = 0) {
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
  }

  /** A step of `dt` seconds nearer looking at (x, y) on ground `z` high: up and down a slope as along it. */
  follow(x: number, y: number, dt: number, z = 0) {
    const k = 1 - Math.exp(-EASE * dt);
    this.target[0] += (x - this.target[0]) * k;
    this.target[1] += (y - this.target[1]) * k;
    this.target[2] += (z - this.target[2]) * k;
  }

  /** Nearer for less than zero, further for more, held within the limits. */
  zoom(by: number) {
    this.distance = Math.max(VIEW.near, Math.min(VIEW.far, this.distance + by));
  }

  /** The camera put where the rig says, for a screen of the camera's aspect. */
  place(camera: Camera) {
    const tall = Math.sqrt(Math.max(1, WIDE / Math.max(camera.aspect, 0.1)));
    const r = this.distance * tall;
    const [x, y] = [this.target[0], this.target[1] + LEAD];
    camera.fov = VIEW.fov;
    camera.target = [x, y, this.target[2]];
    camera.position = [x, y - Math.sin(VIEW.polar) * r, this.target[2] + Math.cos(VIEW.polar) * r];
  }
}
