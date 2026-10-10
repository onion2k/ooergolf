/**
 * The title scene's arithmetic, with no page and no renderer: where the camera stands over The Links' Water Carry, how
 * the word "Of Course!" is fitted to the shape of the screen above the course cards, and how each piece of its lettering
 * drops in, squashes against the ground and springs back, from the title's own clock and nothing else. The page draws
 * what this says, and the fuzzer and the tests step it as it does, so a picture is the same every run and a letter that
 * pokes out of its outline, or a word cut by a phone's edge, is a failing number and not a thing to be noticed.
 *
 * Without this the page would work the fit out in the middle of drawing a frame, and the layout of the cards would
 * be said once in the stylesheet and once in the code that keeps the word clear of them.
 */

/** What the word is, from the lettering, in the title's own units: its width and height. */
export interface Word {
  width: number;
  height: number;
}
/** The word as the traced lettering is, sparkles and flag and all: about seven and a quarter units across and four and a third high. A test holds it to the lettering. */
export const WORD: Word = { width: 7.26, height: 4.34 };

/** The box that holds every piece of a lettering at rest, from the pieces' own bounds: the word's size, as the fit wants it. */
export function wordOf(
  pieces: readonly { pivot: readonly number[]; parts: readonly { mesh: { positions: ArrayLike<number> } }[] }[],
): Word {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const piece of pieces) {
    const b = piecesBounds(piece);
    x0 = Math.min(x0, piece.pivot[0] + b.x0);
    x1 = Math.max(x1, piece.pivot[0] + b.x1);
    y0 = Math.min(y0, piece.pivot[1] + b.y0);
    y1 = Math.max(y1, piece.pivot[1] + b.y1);
  }
  return { width: x1 - x0, height: y1 - y0 };
}

/** How the camera stands over the hole, from the tee: back along the hole, high, looking far up it and down a little. */
export const VIEW = {
  /** How far behind the tee, in yards. */
  back: 12,
  /** How far up the hole it looks, in yards. */
  ahead: 120,
  /** How far the word stands from the camera, in units: near, so the scene's haze adds nothing to the dark outline. */
  depth: 4,
  /** A screen wider than tall: the eye's height and the height of what it looks at, above the tee, and the lens. */
  wide: { eye: 12, aim: 4, fov: 40 },
  /** A screen taller than wide: lower, looking level, through a wider lens, so the hills stand above the cards. */
  tall: { eye: 6, aim: 6, fov: 55 },
} as const;

/**
 * The course cards on the start screen, which the stylesheet places and this says: the panel stands on the foot of the
 * screen `foot` pixels up, and is no taller than `share` of it, `tall` of a phone's. One place, so the word is held clear
 * of the most the panel can be, and the stylesheet reads the height through `--cards-max` and holds no figure of its own.
 */
export const CARDS = { foot: 14, share: 0.56, tall: 0.5, gap: 0.05, top: 0.05, side: 0.92 } as const;

/** Whether a screen of this size is a phone's or a short one's, which the cards take half the height of. */
const isPhone = (width: number, height: number) => width <= 600 || height <= 500;

/** The most height the cards' panel may have, in pixels: what the stylesheet is told. */
export function cardsMax(width: number, height: number): number {
  return (isPhone(width, height) ? CARDS.tall : CARDS.share) * height;
}
/** The top of the cards' panel at its tallest, as a height on the screen from -1 at the foot to 1 at the top. */
export function cardsTop(width: number, height: number): number {
  const top = height - CARDS.foot - cardsMax(width, height);
  return 1 - (2 * top) / height;
}

/** Where the word stands and how big it is, for one screen: the camera's pose, and the word's place in the view. */
export interface TitleFit {
  /** The height of the eye and of what it looks at, above the tee's ground, and the vertical field of view in degrees. */
  eye: number;
  aim: number;
  fov: number;
  /** How far from the camera the word stands, in units. */
  depth: number;
  /** The word's width as a share of the screen's, and where its middle is, as shares of the half width and half height from the middle. */
  share: number;
  centre: [number, number];
}

/**
 * The word fitted to a screen of this `aspect` whose cards reach up to `cardsTop` (a height from -1 to 1): the biggest it
 * can be and stay inside the sides and the top and clear of the cards, never wider than the screen allows; where the room is
 * deep rather than wide (a phone) it stands at the top of it, with the hills and the sky between it and the cards.
 */
export function fitTitle(aspect: number, cardsTop: number, word: Word = WORD): TitleFit {
  const lens = aspect < 1 ? VIEW.tall : VIEW.wide;
  const low = Math.min(cardsTop + CARDS.gap, 0.9);
  const high = 1 - CARDS.top;
  const room = high - low;
  // a word share of the screen's width is half its width in these units, and its height is `aspect * height / width` of that
  const slim = aspect * (word.height / word.width);
  const share = Math.min(CARDS.side, room / 2 / slim);
  const half = share * slim;
  // standing at the top of the room when it is not the room's height that limits it
  const middle = share === CARDS.side ? high - half : (high + low) / 2;
  return { ...lens, depth: VIEW.depth, share, centre: [0, middle] };
}

/** What the camera is: where it is, where it looks and its lens. The renderer's own camera has all of it. */
export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  aspect?: number;
}

/**
 * The camera set behind the tee and looking up the hole to the cup, from `tee` to `cup` over ground that stands `z0` high
 * there: written into `camera` and nothing made.
 */
export function placeCamera(
  camera: CameraPose,
  tee: { x: number; y: number },
  cup: { x: number; y: number },
  z0: number,
  fit: TitleFit,
) {
  const dx = cup.x - tee.x,
    dy = cup.y - tee.y;
  const l = Math.hypot(dx, dy) || 1;
  const fx = dx / l,
    fy = dy / l;
  camera.position[0] = tee.x - fx * VIEW.back;
  camera.position[1] = tee.y - fy * VIEW.back;
  camera.position[2] = z0 + fit.eye;
  camera.target[0] = tee.x + fx * VIEW.ahead;
  camera.target[1] = tee.y + fy * VIEW.ahead;
  camera.target[2] = z0 + fit.aim;
  camera.fov = fit.fov;
}

/** Where the word's plane is in the world: its middle, its right and up and the way it faces, and how many world units a title unit is. */
export interface Frame {
  origin: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  back: [number, number, number];
  scale: number;
}
export const newFrame = (): Frame => ({
  origin: [0, 0, 0],
  right: [1, 0, 0],
  up: [0, 0, 1],
  back: [0, -1, 0],
  scale: 1,
});

/**
 * The plane the word stands in for this camera and fit: upright, square to the way the camera looks along the ground,
 * `fit.depth` along its line of sight, placed by the fit's share and centre and as big as the share says. Written into `out`.
 */
export function titleFrame(
  camera: CameraPose & { aspect: number },
  fit: TitleFit,
  word: Word,
  out = newFrame(),
): Frame {
  const p = camera.position,
    q = camera.target;
  let f0 = q[0] - p[0],
    f1 = q[1] - p[1],
    f2 = q[2] - p[2];
  const fl = Math.hypot(f0, f1, f2) || 1;
  f0 /= fl;
  f1 /= fl;
  f2 /= fl;
  const rl = Math.hypot(f0, f1) || 1;
  out.right[0] = f1 / rl;
  out.right[1] = -f0 / rl;
  out.right[2] = 0;
  out.up[0] = 0;
  out.up[1] = 0;
  out.up[2] = 1;
  out.back[0] = -f0 / rl;
  out.back[1] = -f1 / rl;
  out.back[2] = 0;
  const halfH = fit.depth * Math.tan((camera.fov * Math.PI) / 360);
  const halfW = halfH * camera.aspect;
  out.scale = (fit.share * 2 * halfW) / word.width;
  const [cx, cy] = fit.centre;
  out.origin[0] = p[0] + f0 * fit.depth + out.right[0] * cx * halfW;
  out.origin[1] = p[1] + f1 * fit.depth + out.right[1] * cx * halfW;
  out.origin[2] = p[2] + f2 * fit.depth + cy * halfH;
  return out;
}

/** What a piece of the lettering is, as the pose reads it: its kind, whose it is and its place in the drop. */
export interface PoseOf {
  kind: string;
  owner: string;
  step: number;
}

/**
 * The drop. Each step of the lettering starts `apart` seconds after the one before it and falls from `height` units up
 * for `fall` seconds, then the face squashes down by `squash` and out by `widen` of it (little out, since the outline it
 * stands in is cut once and does not squash with it, and a face that widened more would stand out of it), and springs (`rate` radians a
 * second, damped by `decay`) to rest in `settle` seconds, going to nothing at the end and not tailing off for ever.
 * `lead` is how long the clock runs before the first letter, so the panel has begun to fade away first.
 */
export const DROP = {
  apart: 0.09,
  fall: 0.3,
  settle: 0.3,
  height: 2.6,
  squash: 0.3,
  widen: 0.18,
  rate: 15,
  decay: 7,
  lead: 0.2,
} as const;

/** How a piece is posed at a time: whether it is there yet, how far above its place, and its squash across and up. */
export interface Pose {
  shown: boolean;
  lift: number;
  sx: number;
  sy: number;
}

/** Whether a kind of piece is squashed as it lands. The outline is cut once and drops whole, so no crack opens between two rows; a sparkle is a flash, not a body. */
const squashes = (kind: string) => kind !== 'outline' && kind !== 'sparkle';

/** When a piece is at rest for good, from the clock's nought. */
export function endOf(piece: PoseOf): number {
  return DROP.apart * piece.step + DROP.fall + (squashes(piece.kind) ? DROP.settle : 0);
}

/**
 * How `piece` is posed `t` seconds into the title, written into `out`. A function of the clock alone: the same for the
 * same time every run, never below its place, and exactly at rest from `endOf` on. Under reduced motion every piece
 * stands at rest at once, whatever the time.
 */
export function letterPose(piece: PoseOf, t: number, reducedMotion: boolean, out: Pose): Pose {
  out.shown = true;
  out.lift = 0;
  out.sx = 1;
  out.sy = 1;
  if (reducedMotion) return out;
  const tau = t - DROP.apart * piece.step;
  if (tau < 0) {
    out.shown = false;
    return out;
  }
  if (tau < DROP.fall) {
    const k = tau / DROP.fall;
    out.lift = DROP.height * (1 - k * k);
    return out;
  }
  if (!squashes(piece.kind)) return out;
  const x = tau - DROP.fall;
  if (x >= DROP.settle - 1e-9) return out;
  const left = 1 - x / DROP.settle;
  const a = DROP.squash * Math.exp(-DROP.decay * x) * Math.cos(DROP.rate * x) * left * left;
  out.sy = 1 - a;
  out.sx = 1 + DROP.widen * a;
  return out;
}

/**
 * The title as it runs on the page: a clock of its own, which begins `lead` seconds before the first letter and stops where
 * the last has landed, and says so. Stepped by the page's frames, so a paused page is still and a test can step it.
 */
export class TitleScene {
  /** Seconds into the title: negative before the first letter. Never more than `end`. */
  t: number;
  /** When the last piece is at rest. */
  readonly end: number;
  constructor(
    pieces: readonly PoseOf[],
    readonly reduced: boolean,
    standing = false,
  ) {
    this.end = pieces.reduce((m, p) => Math.max(m, endOf(p)), 0);
    this.t = reduced || standing ? this.end : -DROP.lead;
  }
  get landed(): boolean {
    return this.t >= this.end;
  }
  /** Time passed; a step that is not a time, or goes back, is left out. */
  advance(dt: number) {
    if (!(dt >= 0) || !Number.isFinite(dt)) return;
    this.t = Math.min(this.end, this.t + dt);
  }
  /** Stood at once, as a player's tap or the card's Courses button asks. */
  stand() {
    this.t = this.end;
  }
  pose(piece: PoseOf, out: Pose): Pose {
    return letterPose(piece, this.t, this.reduced, out);
  }
}

/** The box round a piece in its own frame, whose middle is its pivot. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const bounded = new WeakMap<object, Bounds>();
/** The box round all of a piece's meshes, found once. */
export function piecesBounds(piece: { parts: readonly { mesh: { positions: ArrayLike<number> } }[] }): Bounds {
  let b = bounded.get(piece);
  if (b) return b;
  b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const part of piece.parts) {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      b.x0 = Math.min(b.x0, p[i]);
      b.x1 = Math.max(b.x1, p[i]);
      b.y0 = Math.min(b.y0, p[i + 1]);
      b.y1 = Math.max(b.y1, p[i + 1]);
    }
  }
  bounded.set(piece, b);
  return b;
}

/**
 * The matrix that places a piece, column by column as the renderer reads it, in `out`: its own frame scaled, squashed
 * and set in the word's plane at its pivot, raised by the drop. A piece not yet shown is a matrix of no size, which the renderer
 * draws as nothing: a group drawn none at all is a warning from the GPU every frame.
 */
export function poseMatrix(out: Float32Array, frame: Frame, pivot: readonly number[], pose: Pose) {
  if (!pose.shown) {
    out.fill(0);
    out[15] = 1;
    return;
  }
  const s = frame.scale;
  const px = pivot[0],
    py = pivot[1] + pose.lift;
  const depth = Math.max(pose.sx, 1e-4);
  for (let a = 0; a < 3; a++) {
    out[a] = frame.right[a] * s * pose.sx;
    out[4 + a] = frame.up[a] * s * pose.sy;
    out[8 + a] = frame.back[a] * s * depth;
    out[12 + a] = frame.origin[a] + (frame.right[a] * px + frame.up[a] * py) * s;
  }
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
}

/**
 * Where a piece is on the screen: its corners through the camera's view and projection (`viewProjection`, column by
 * column), written as the left, foot, right and top of the box that holds them, from -1 to 1 each way and y up.
 */
export function boxOf(
  out: number[],
  viewProjection: ArrayLike<number>,
  frame: Frame,
  pivot: readonly number[],
  bounds: Bounds,
  pose: Pose,
) {
  const m = viewProjection;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let k = 0; k < 4; k++) {
    const lx = k & 1 ? bounds.x1 : bounds.x0,
      ly = k & 2 ? bounds.y1 : bounds.y0;
    const px = pivot[0] + lx * pose.sx,
      py = pivot[1] + pose.lift + ly * pose.sy;
    const w = [0, 1, 2].map((a) => frame.origin[a] + (frame.right[a] * px + frame.up[a] * py) * frame.scale);
    const cw = m[3] * w[0] + m[7] * w[1] + m[11] * w[2] + m[15];
    const nx = (m[0] * w[0] + m[4] * w[1] + m[8] * w[2] + m[12]) / cw;
    const ny = (m[1] * w[0] + m[5] * w[1] + m[9] * w[2] + m[13]) / cw;
    x0 = Math.min(x0, nx);
    x1 = Math.max(x1, nx);
    y0 = Math.min(y0, ny);
    y1 = Math.max(y1, ny);
  }
  out[0] = x0;
  out[1] = y0;
  out[2] = x1;
  out[3] = y1;
}
