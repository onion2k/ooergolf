/**
 * The camera: three-quarters from above, looking up the course from the tee
 * end, following the ball. It eases after the ball rather than jumping, so a
 * shot is watched and not cut to; it glides to a new hole's tee from where
 * it was looking, by game time, so a hole is arrived at and not cut to
 * either; and the wheel can bring it nearer or take it further within
 * limits. It looks a little ahead of the ball, up the course. On a screen taller than it is wide it stands further back, though
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

/**
 * How long the camera takes to glide to a new hole's tee, in seconds of game
 * time: quick enough to be there before a player has lined up a shot, slow
 * enough to be seen travelling and not cut.
 */
export const GLIDE = 0.8;

export class CameraRig {
  readonly fov = VIEW.fov;
  /** Where it looks, on the ground. */
  readonly target: [number, number, number] = [0, 0, 0];
  /** How far back it stands, before a tall screen pushes it further. */
  distance: number = VIEW.home;
  /** What is left of the way from where it was looking when a hole began, and when that was, in game time. */
  private readonly behind: [number, number, number] = [0, 0, 0];
  private glidFrom = -Infinity;
  /** Where it looks, glide and all, written by `looking` for `place`. */
  private readonly at: [number, number, number] = [0, 0, 0];

  /** Straight to looking at (x, y) on ground `z` high, without easing: for the first hole, and a camera parked by a test. */
  jump(x: number, y: number, z = 0) {
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
    this.behind[0] = this.behind[1] = this.behind[2] = 0;
    this.glidFrom = -Infinity;
  }

  /**
   * To looking at (x, y) on ground `z` high, for a hole begun at game time
   * `t`: from wherever it was looking then, part way through a glide or not,
   * eased away and eased in over `GLIDE`, so it never jumps. It follows the
   * ball all the while, as ever; the glide is what is left over, and is
   * nought at the end.
   */
  glide(x: number, y: number, z: number, t: number) {
    const [ax, ay, az] = this.looking(t);
    this.jump(x, y, z);
    this.behind[0] = ax - x;
    this.behind[1] = ay - y;
    this.behind[2] = az - z;
    this.glidFrom = t;
  }

  /** How far it has still to glide to its place at game time `t`, in world units: nought when it is not gliding. */
  gliding(t: number): number {
    const k = this.left(t);
    return k ? k * Math.hypot(this.behind[0], this.behind[1], this.behind[2]) : 0;
  }

  /** The share of a glide still to go at game time `t`, eased at both ends: one as it begins, nought from its end on. */
  private left(t: number): number {
    const u = (t - this.glidFrom) / GLIDE;
    if (!(u < 1)) return 0;
    const v = Math.max(0, u);
    return 1 - v * v * (3 - 2 * v);
  }

  /** Where it looks at game time `t`: where it is following, and what is left of a glide. */
  private looking(t: number): [number, number, number] {
    const k = this.left(t);
    for (let a = 0; a < 3; a++) this.at[a] = this.target[a] + this.behind[a] * k;
    return this.at;
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

  /** The camera put where the rig says at game time `t`, for a screen of the camera's aspect: any glide over, untold. */
  place(camera: Camera, t = Infinity) {
    const tall = Math.sqrt(Math.max(1, WIDE / Math.max(camera.aspect, 0.1)));
    const r = this.distance * tall;
    const at = this.looking(t);
    const [x, y, z] = [at[0], at[1] + LEAD, at[2]];
    camera.fov = VIEW.fov;
    camera.target = [x, y, z];
    camera.position = [x, y - Math.sin(VIEW.polar) * r, z + Math.cos(VIEW.polar) * r];
  }
}
