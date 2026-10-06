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
 * It can also be blended up to the overhead view, the whole hole from straight above, which is for looking at and
 * never for aiming from, and leaves the view it came from exactly as it was.
 *
 * It only says where the camera is; the page hands it the renderer's camera
 * to place, and nothing here draws.
 */
import type { Camera } from 'artshape-render/gpu/camera';

/**
 * How it looks: the lens, and how far back it stands at each end of the zoom and at home. A golf hole lets it stand
 * back further, `golfFar`, since a player who cannot see where a shot would come down cannot play it: a drive goes
 * 250 yards, and from 110 back the top of the screen is 98 yards off.
 */
export const VIEW = { fov: 40, near: 30, far: 110, home: 62, golfFar: 200, phoneFar: 400 };
/**
 * How far it tilts, as its angle from the vertical: at home, three-quarters from above, the steepest it goes, and the
 * lowest. The lowest is held to 57 degrees because the grass is what a frame costs, and looking toward the horizon
 * draws far more of it: 3.7 ms a frame at this tilt against 2.9 at home, and 4.7 at 66 degrees, which is nearly the
 * whole budget.
 */
export const TILT = { least: 0.3, home: 0.78, most: 1 } as const;
/** How quickly it catches up with the ball: the share of the way it goes in a second, as a rate. */
const EASE = 4;
/**
 * How much quicker it catches up with a ball in flight, by how fast it goes: a drive at 216 a second would leave it
 * fifty units behind at the pace a putt is followed at, and out of the top of the screen. The pace is `EASE` and one
 * more for each `FLIGHT.per` of the ball's speed.
 */
export const FLIGHT = { per: 15 } as const;

/** The pace, as a rate, at which to catch up with a ball going `speed`: `EASE` for one at rest. */
export function catchUp(speed: number): number {
  return EASE + Math.max(0, speed) / FLIGHT.per;
}
/** How much wider than tall a screen must be before it needs no more room: below this, the camera stands back. */
const WIDE = 1.25;
/** How much further back a screen of `aspect` stands the camera than its distance says: one for a screen that is wide enough. */
export function tallOf(aspect: number): number {
  return Math.sqrt(Math.max(1, WIDE / Math.max(aspect, 0.1)));
}
/**
 * How much a screen is a phone held upright, from nought to one: nought at a tablet's shape and wider, one at a phone's
 * (0.6 wide for each tall and narrower), and between in between. A phone's screen is so narrow that standing back far
 * costs the frame less ground than a desk's does, and so tall that the coins and the shop across the top are in the way of
 * a landing that is as far up it as the camera can put it.
 */
export function phoneOf(aspect: number): number {
  return Math.max(0, Math.min(1, (0.75 - aspect) / 0.15));
}
/**
 * The furthest the camera stands on a golf hole, tall screen and all: `VIEW.golfFar`, and for a phone upright, when the
 * page tells the aim view is for one (`phones`), up to `VIEW.phoneFar`. The desk's and the tablet's are as they were.
 */
export function standOf(aspect: number, phones = true): number {
  return VIEW.golfFar + (phones ? (VIEW.phoneFar - VIEW.golfFar) * phoneOf(aspect) : 0);
}
/**
 * How far ahead of the ball, the way the camera faces, it looks, so the ball
 * sits low on the screen with the way ahead above it, and not in the middle of
 * the rough behind the tee.
 */
export const LEAD = 10;

/** How quickly it eases to an aim view, as a rate: the share of the way it goes in a second, as `EASE` is. */
const AIM_EASE = 4;
/** How quickly it turns to face a place it is told to, as a rate: most of the way round in a half second, and there in two. */
const TURN_EASE = 6;
/** How near an aim view it is called there, in yards of distance and in radians of tilt, which snaps it the rest of the way. */
const SETTLED = { distance: 0.25, tilt: 0.002, lead: 0.25, turn: 0.002 };

/**
 * The overhead view, which is the hole seen whole from straight above, to be looked at and never aimed from. `tilt` is how
 * far from the vertical it looks (not nought, since the renderer's camera has the ground's up for its own and looking
 * exactly down is degenerate), `ease` the rate the view blends in and out at, `near` the nearest it may be zoomed to,
 * `far` the furthest (provisional until the cost of the view is measured on the biggest holes; the renderer's far
 * plane follows it, `CLIP`), and `margin` how much more than the hole's bounds the fit shows.
 */
export const OVERHEAD = { tilt: 0.05, ease: 4, near: 60, far: 1500, margin: 1.08 } as const;
/**
 * The renderer's far plane. It is `far` for every view the camera has had, and it is raised while the overhead view is on or
 * blending, to `overhead` times how far back that view stands: the ground at the screen's far edge is met that much deeper
 * than the camera is high while it swings up and over (a view tilted 45 degrees with half the lens above it sees ground 2.4
 * times as deep as it is back), and a fixed 800 cut off a hole whose fit is 868 to 948 back. Only then, since a far plane
 * further out costs the depth buffer its precision, which the normal view has no need to spend.
 */
export const CLIP = { far: 800, overhead: 2.5 } as const;
/** The ground a hole covers, the corners of a layout's `bounds`. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
/** What the overhead view is fitted to: the bounds of the hole and the distance that shows all of them. */
export interface OverheadFit {
  bounds: Bounds;
  distance: number;
}
/** How near the blend is to its goal before it is called there, which snaps it the rest of the way. */
const BLENDED = 0.002;

/**
 * How far back the overhead view stands to show the whole of `bounds` (and `OVERHEAD.margin` more) for a camera turned to
 * `azimuth` on a screen of `aspect`: the least distance at which every corner is on the screen, and no more than
 * `OVERHEAD.far`. Worked out about the middle of the bounds, in the camera's own right and up, since the view is turned.
 */
export function overheadFit(bounds: Bounds, azimuth: number, aspect: number): number {
  const cx = (bounds.minX + bounds.maxX) / 2,
    cy = (bounds.minY + bounds.maxY) / 2;
  // the camera's right and forward on the ground: forward is where it faces (sin a, cos a)
  const [rx, ry, fx, fy] = [Math.cos(azimuth), -Math.sin(azimuth), Math.sin(azimuth), Math.cos(azimuth)];
  let across = 0,
    up = 0;
  for (const x of [bounds.minX, bounds.maxX])
    for (const y of [bounds.minY, bounds.maxY]) {
      across = Math.max(across, Math.abs((x - cx) * rx + (y - cy) * ry));
      up = Math.max(up, Math.abs((x - cx) * fx + (y - cy) * fy));
    }
  const h = Math.tan((VIEW.fov * Math.PI) / 360);
  const need = Math.max(up / h, across / (h * Math.max(aspect, 0.1))) * OVERHEAD.margin;
  return Math.min(OVERHEAD.far, Math.max(VIEW.near, Number.isFinite(need) ? need : VIEW.near));
}

/** An angle brought within one turn either way of nought. */
export const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * The azimuth that faces the camera from `from` toward `to` on the ground: nought for a place straight up the course, a
 * quarter turn for one due east. Nothing for a place that is where it is (within a hundredth of a yard) or that is not a
 * place, since there is no way to face it.
 */
export function facing(from: { x: number; y: number }, to: { x: number; y: number }): number | null {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) return null;
  return Math.atan2(dx, dy);
}

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
  /** How far ahead of the ball, the way it faces, it looks: `LEAD`, or more on a golf hole where the landing is a long way off. */
  lead: number = LEAD;
  /** How far back the zoom goes: `VIEW.far`, and `VIEW.golfFar` on a golf hole. */
  far: number = VIEW.far;
  /** The furthest the camera itself stands from what it looks at, tall screen and all: none on a hole of minigolf. */
  private stand = Infinity;
  /** Whether the hole is golf, and the shape of the screen: what the zoom's limit and the camera's are worked out from. */
  private golfNow = false;
  private screen = 1.6;
  /** The view it is easing to, if it is, on a golf hole: each of the three is left alone where it is not a number. */
  private goal: { distance: number; tilt: number; lead: number } | null = null;
  /** Which way it faces, turned from up the course: nought at the tee's view, and within a turn either way of it. */
  azimuth = 0;
  /** How far from the vertical it looks down: `TILT.home` at the tee's view, and within `TILT`'s limits. */
  tilt: number = TILT.home;
  /** The way it is turning to face, as an azimuth within a turn either way, if it is: eased to by `settle`. */
  private heading: number | null = null;
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
  /** Whether the overhead view is wanted, and how far it is blended in, from nought (the normal view) to one (from above). */
  private wanted = false;
  private k = 0;
  /** What the overhead view is fitted to, once told; nought of it until then. */
  private fit: OverheadFit | null = null;
  /** Where the overhead view looks and how far back it stands: its own, so the normal view is untouched while it is on. */
  readonly top = { x: 0, y: 0, distance: 0 };

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
    // home in the shortest way round, and the tee's own tilt; and no longer turning to face anywhere
    this.heading = null;
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

  /**
   * A step of `dt` seconds nearer looking at (x, y) on ground `z` high: up and down a slope as along it. At the pace
   * of `ease`, a rate, which is `EASE` unless it is told: a ball in flight is followed at `catchUp`'s.
   */
  follow(x: number, y: number, dt: number, z = 0, ease = EASE) {
    const k = 1 - Math.exp(-ease * dt);
    this.target[0] += (x - this.target[0]) * k;
    this.target[1] += (y - this.target[1]) * k;
    this.target[2] += (z - this.target[2]) * k;
  }

  /**
   * Whether the hole is golf, which lets the camera stand further back (and no further than `VIEW.golfFar`, however
   * tall the screen). A view zoomed out past the limits of the hole that is begun is brought within them.
   */
  setGolf(on: boolean) {
    this.golfNow = on;
    this.limit();
    if (!on) this.lead = LEAD;
    this.goal = null;
  }

  /**
   * Told the shape of the screen it is drawn on, which a phone upright makes the zoom's limit further on a golf hole
   * (`standOf`): the zoom is of the distance before a tall screen pushes the camera back, so it must reach as far as
   * the camera may stand once it has.
   */
  setScreen(aspect: number) {
    this.screen = aspect;
    this.limit();
  }

  /** The zoom's limit and how far the camera may stand, worked out from whether the hole is golf and the screen, and a view past them brought within. */
  private limit() {
    const on = this.golfNow;
    this.stand = on ? standOf(this.screen) : Infinity;
    this.far = on ? Math.max(VIEW.golfFar, this.stand / tallOf(this.screen)) : VIEW.far;
    this.distance = Math.min(this.far, this.distance);
  }

  /** Whether the hole it is set for is golf. */
  get golf(): boolean {
    return this.stand !== Infinity;
  }

  /** Whether it is easing to an aim view. */
  get aiming(): boolean {
    return this.goal !== null;
  }

  /**
   * Sent to look at a shot from `goal`, the distance and the tilt and the lead that show where it comes down, and eased
   * there by `settle`; or put there at once if `now`, as the first hole is. Held within the limits. The way it faces is
   * not touched, and whatever the player does to the view, a zoom or a turn, takes it back from here.
   */
  aimAt(goal: { distance: number; tilt: number; lead?: number }, now = false) {
    const distance = Number.isFinite(goal.distance)
      ? Math.max(VIEW.near, Math.min(this.far, goal.distance))
      : this.distance;
    const tilt = Number.isFinite(goal.tilt) ? Math.max(TILT.least, Math.min(TILT.most, goal.tilt)) : this.tilt;
    const lead = goal.lead !== undefined && Number.isFinite(goal.lead) ? Math.max(0, goal.lead) : this.lead;
    if (now) {
      this.distance = distance;
      this.tilt = tilt;
      this.lead = lead;
      this.goal = null;
      return;
    }
    this.goal = { distance, tilt, lead };
  }

  /**
   * Sent to face `azimuth` (see `facing`), by the shortest way round, eased there by `settle`: only the way it faces, so
   * the distance, the tilt, the lead and an aim view it is easing to are left as they are. A turn of the player's own takes it
   * back from here, as it does an aim view; so does a new hole. A number that is not one faces nowhere.
   */
  turnTo(azimuth: number) {
    if (Number.isFinite(azimuth)) this.heading = wrap(azimuth);
  }

  /** The azimuth it is turning to, or the one it has when it is turning to none. */
  get headed(): number {
    return this.heading ?? this.azimuth;
  }

  /** Whether it is turning to face a place. */
  get turning(): boolean {
    return this.heading !== null;
  }

  /**
   * A step of `dt` seconds nearer the view it is easing to and the place it is turning to face: by the time that has
   * passed, so a slow frame goes as far as the frames it was.
   */
  settle(dt: number) {
    // the blend to and from the overhead view, by the time that has passed
    const g = this.wanted ? 1 : 0;
    if (this.k !== g) {
      this.k += (g - this.k) * (1 - Math.exp(-OVERHEAD.ease * Math.max(0, dt)));
      if (Math.abs(g - this.k) < BLENDED) this.k = g;
    }
    const h = this.heading;
    if (h !== null) {
      const to = wrap(h - this.azimuth);
      const left = to * Math.exp(-TURN_EASE * Math.max(0, dt));
      if (Math.abs(left) < SETTLED.turn) {
        this.azimuth = h;
        this.heading = null;
      } else this.azimuth = wrap(h - left);
    }
    const aim = this.goal;
    if (!aim) return;
    const k = 1 - Math.exp(-AIM_EASE * Math.max(0, dt));
    this.distance += (aim.distance - this.distance) * k;
    this.tilt += (aim.tilt - this.tilt) * k;
    this.lead += (aim.lead - this.lead) * k;
    if (
      Math.abs(aim.distance - this.distance) < SETTLED.distance &&
      Math.abs(aim.tilt - this.tilt) < SETTLED.tilt &&
      Math.abs(aim.lead - this.lead) < SETTLED.lead
    ) {
      this.distance = aim.distance;
      this.tilt = aim.tilt;
      this.lead = aim.lead;
      this.goal = null;
    }
  }

  /**
   * Nearer for less than zero, further for more, held within the limits. The player's own, which ends an ease to an aim
   * view; in the overhead view it is that view's own distance, between `OVERHEAD.near` and the fit, and the normal view and
   * the ease to an aim view are left as they are.
   */
  zoom(by: number) {
    if (this.wanted && this.fit) {
      if (Number.isFinite(by)) this.top.distance = this.reach(this.top.distance + by);
      return;
    }
    this.goal = null;
    this.distance = Math.max(VIEW.near, Math.min(this.far, this.distance + by));
  }

  /**
   * Turned by `turn` radians (more is toward +X), which it may be without limit, and tilted by `tilt`, more being a
   * lower view, within `TILT`. A number that is not one turns and tilts it nowhere. The player's own, which ends an ease
   * to an aim view and a turn to face a place (`turnTo`).
   */
  orbit(turn: number, tilt: number) {
    this.goal = null;
    this.heading = null;
    if (Number.isFinite(turn)) this.azimuth = wrap(this.azimuth + turn);
    if (Number.isFinite(tilt)) this.tilt = Math.max(TILT.least, Math.min(TILT.most, this.tilt + tilt));
  }

  /** A distance for the overhead view, held between the nearest it zooms and the one that fits the hole. */
  private reach(distance: number): number {
    const most = this.fit?.distance ?? 0;
    return Math.max(Math.min(OVERHEAD.near, most), Math.min(most, distance));
  }

  /** How far the renderer's far plane must be for this view: `CLIP.far`, and further while the overhead view is up or blending. */
  get farPlane(): number {
    return this.k > 0 ? Math.max(CLIP.far, this.top.distance * CLIP.overhead) : CLIP.far;
  }

  /** Whether the overhead view is wanted. */
  get overhead(): boolean {
    return this.wanted;
  }

  /** How far the overhead view is blended in: nought is the normal view, one the view from above. */
  get blend(): number {
    return this.k;
  }

  /** What the overhead view is held to, nothing before it has been fitted to a hole. */
  get overheadLimits(): { bounds: Bounds; least: number; most: number } | null {
    const f = this.fit;
    return f ? { bounds: f.bounds, least: Math.min(OVERHEAD.near, f.distance), most: f.distance } : null;
  }

  /**
   * The overhead view switched on or off, blended by `settle`. Switching on is fitted to a hole (`fit`: its bounds, and the
   * distance `overheadFit` says shows them all) and begins looking at the middle of it, standing as far back as it fits;
   * switching on without ever having been fitted, or to a fit that is not a hole, does nothing. Whether it is on. Switched
   * off, the normal view is exactly as it was: it was never touched.
   */
  setOverhead(on: boolean, fit?: OverheadFit): boolean {
    if (!on) {
      this.wanted = false;
      return false;
    }
    if (fit) {
      const b = fit.bounds;
      if (![b.minX, b.minY, b.maxX, b.maxY, fit.distance].every(Number.isFinite) || b.maxX < b.minX || b.maxY < b.minY)
        return this.wanted;
      this.fit = { bounds: { ...b }, distance: fit.distance };
      this.top.x = (b.minX + b.maxX) / 2;
      this.top.y = (b.minY + b.maxY) / 2;
      this.top.distance = fit.distance;
    }
    if (!this.fit) return this.wanted;
    this.wanted = true;
    return true;
  }

  /**
   * The overhead view dragged by a finger that moved `dx` pixels across and `dy` down on a screen `heightPx` tall: the
   * ground under the finger goes with it, so the view moves the other way across the ground, along the way it is turned,
   * and is held to the hole's bounds. Nothing when the view is not overhead.
   */
  pan(dx: number, dy: number, heightPx: number) {
    const f = this.fit;
    if (!this.wanted || !f || !(heightPx > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // the ground a pixel covers at the distance it stands
    const per = (2 * this.top.distance * Math.tan((VIEW.fov * Math.PI) / 360)) / heightPx;
    const a = this.azimuth;
    // the view's right and forward: the finger going right takes the view left, and going down takes it forward
    this.top.x += (-dx * Math.cos(a) + dy * Math.sin(a)) * per;
    this.top.y += (dx * Math.sin(a) + dy * Math.cos(a)) * per;
    const b = f.bounds;
    this.top.x = Math.max(b.minX, Math.min(b.maxX, this.top.x));
    this.top.y = Math.max(b.minY, Math.min(b.maxY, this.top.y));
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
    const r = Math.min(
      this.distance * tallOf(camera.aspect),
      this.stand === Infinity ? this.stand : standOf(camera.aspect),
    );
    const at = this.looking(t);
    const { azimuth, tilt } = this.view(t, this.seen);
    // the way it faces on the ground, and the point it looks at a lead ahead of the ball that way
    const [fx, fy] = [Math.sin(azimuth), Math.cos(azimuth)];
    let [x, y, z] = [at[0] + fx * this.lead, at[1] + fy * this.lead, at[2]];
    camera.fov = VIEW.fov;
    const k = this.k;
    if (k > 0) {
      // blended toward the view from above: where it looks, how far it tilts and how far back it stands are each mixed, so the
      // camera swings up and over the hole and is exactly the overhead view at one; the turn is kept
      const t = tilt + (OVERHEAD.tilt - tilt) * k;
      const d = r + (this.top.distance - r) * k;
      x += (this.top.x - x) * k;
      y += (this.top.y - y) * k;
      z -= z * k;
      camera.target = [x, y, z];
      camera.position = [x - fx * Math.sin(t) * d, y - fy * Math.sin(t) * d, z + Math.cos(t) * d];
      return;
    }
    camera.target = [x, y, z];
    camera.position = [x - fx * Math.sin(tilt) * r, y - fy * Math.sin(tilt) * r, z + Math.cos(tilt) * r];
  }
}
