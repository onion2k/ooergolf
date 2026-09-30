/**
 * The camera: three-quarters from above, looking up the course from the tee
 * end, following the ball. It eases after the ball rather than jumping, so a
 * shot is watched and not cut to; it glides to a new hole's tee from where
 * it was looking, by game time, so a hole is arrived at and not cut to
 * either; and the wheel can bring it nearer or take it further within
 * limits. It can be orbited: turned right round the ball, and tilted between
 * a steeper view and a lower one, and it eases home to the tee's view when a
 * hole begins. It looks a little ahead of the ball, the way it faces, so the
 * ball sits low on the screen from every side. On a screen taller than it is wide it stands further back, though
 * not so far that the whole width fits: a phone shows the way ahead large and
 * the far sides of the course less, since it follows the ball anyway.
 *
 * It only says where the camera is; the page hands it the renderer's camera
 * to place, and nothing here draws.
 */
import type { Camera } from 'artshape-render/gpu/camera';

/** How it looks: the lens, and how far back it stands at each end of the zoom and at home. */
export const VIEW = { fov: 40, near: 30, far: 110, home: 62 };
/**
 * How far it tilts, as its angle from the vertical: at home, three-quarters from above, the steepest it goes, and the
 * lowest. The lowest is held to 57 degrees because the grass is what a frame costs, and looking toward the horizon
 * draws far more of it: 3.7 ms a frame at this tilt against 2.9 at home, and 4.7 at 66 degrees, which is nearly the
 * whole budget.
 */
export const TILT = { least: 0.3, home: 0.78, most: 1 } as const;
/** How quickly it catches up with the ball: the share of the way it goes in a second, as a rate. */
const EASE = 4;
/** How much wider than tall a screen must be before it needs no more room: below this, the camera stands back. */
const WIDE = 1.25;
/**
 * How far ahead of the ball, the way the camera faces, it looks, so the ball
 * sits low on the screen with the way ahead above it, and not in the middle of
 * the rough behind the tee.
 */
export const LEAD = 10;

/** An angle brought within one turn either way of nought. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

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
  /** Which way it faces, turned from up the course: nought at the tee's view, and within a turn either way of it. */
  azimuth = 0;
  /** How far from the vertical it looks down: `TILT.home` at the tee's view, and within `TILT`'s limits. */
  tilt: number = TILT.home;
  /** What is left of the way from where it was looking when a hole began, and when that was, in game time. */
  private readonly behind: [number, number, number] = [0, 0, 0];
  /** What is left of the turn and the tilt it was at when the hole began, eased away over the same glide. */
  private easeTurn = 0;
  private easeTilt = 0;
  private glidFrom = -Infinity;
  /** The view `place` works from, written and never made. */
  private readonly seen = { azimuth: 0, tilt: 0 };
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
    // as it is turned and tilted at this moment, which is what it eases from
    const { azimuth, tilt } = this.view(t);
    this.jump(x, y, z);
    this.behind[0] = ax - x;
    this.behind[1] = ay - y;
    this.behind[2] = az - z;
    this.glidFrom = t;
    // home in the shortest way round, and the tee's own tilt
    this.azimuth = 0;
    this.tilt = TILT.home;
    this.easeTurn = wrap(azimuth);
    this.easeTilt = tilt - TILT.home;
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

  /**
   * Turned by `turn` radians (more is toward +X), which it may be without limit, and tilted by `tilt`, more being a
   * lower view, within `TILT`. A number that is not one turns and tilts it nowhere.
   */
  orbit(turn: number, tilt: number) {
    if (Number.isFinite(turn)) this.azimuth = wrap(this.azimuth + turn);
    if (Number.isFinite(tilt)) this.tilt = Math.max(TILT.least, Math.min(TILT.most, this.tilt + tilt));
  }

  /** How it is turned and tilted at game time `t`: what a player has done to it, and what is left to ease away. */
  view(t: number, out = { azimuth: 0, tilt: 0 }): { azimuth: number; tilt: number } {
    const k = this.left(t);
    out.azimuth = this.azimuth + this.easeTurn * k;
    out.tilt = this.tilt + this.easeTilt * k;
    return out;
  }

  /** The camera put where the rig says at game time `t`, for a screen of the camera's aspect: any glide over, untold. */
  place(camera: Camera, t = Infinity) {
    const tall = Math.sqrt(Math.max(1, WIDE / Math.max(camera.aspect, 0.1)));
    const r = this.distance * tall;
    const at = this.looking(t);
    const { azimuth, tilt } = this.view(t, this.seen);
    // the way it faces on the ground, and the point it looks at a lead ahead of the ball that way
    const [fx, fy] = [Math.sin(azimuth), Math.cos(azimuth)];
    const [x, y, z] = [at[0] + fx * LEAD, at[1] + fy * LEAD, at[2]];
    camera.fov = VIEW.fov;
    camera.target = [x, y, z];
    camera.position = [x - fx * Math.sin(tilt) * r, y - fy * Math.sin(tilt) * r, z + Math.cos(tilt) * r];
  }
}
