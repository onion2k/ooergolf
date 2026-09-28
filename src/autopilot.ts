/**
 * The ball played by the game itself: for measuring how the course plays
 * without a person at the controls. It finds a way over the grass from the
 * ball to the cup, aims at the farthest point along it that it can see
 * clearly, and strikes as hard as that distance needs: to stop there, or,
 * when it is the cup, to arrive gently enough to drop.
 *
 * Everything that holds the game to a figure plays through this: the pace
 * gate, the determinism check, the leak watch, and par, which is what it
 * takes. So it is a measuring instrument first, and must get round every
 * hole. With a skill it slips a little in aim and power, from a chance of its
 * own, as a player does; without one it plays every shot exactly.
 *
 * What moves on a hole moves with game time alone, so it can see where a
 * barrier or a windmill's blade will be when its ball gets there, and waits
 * for a moment when the way is clear, as a player watches the blades before
 * striking; though not for ever.
 *
 * It is handed the game, and knows nothing of the page.
 */
import {
  BALL,
  KIND_RADIUS,
  ROLL,
  SAND,
  TILE,
  fromPosts,
  slopeAt,
  stepAt,
  terrainAt,
  onFloor,
  powerFor,
  rollsFor,
  strikeSpeed,
  tileAt,
  type Layout,
} from './arena';
import type { Game } from './game';
import { Obstacles } from './obstacles';
import { PHYSICS } from './physics';
import type { Random } from './random';
import type { Shot } from './shot';

/** How fast a ball it means for the cup is going when it gets there: inside what the cup catches off its middle, 7. */
const ARRIVE = 4;
/** How far either side of its line the ball must have grass, beyond its own radius. */
const CLEAR = 0.3;
/**
 * How far past a point on the way the grass must go on clear: a share of the
 * shot and a little more, since its sense of distance is good to about a
 * tenth, and a ball that stops a little long must not roll into water.
 */
const OVERRUN = { share: 0.2, more: 2 };
/** How high a rise the ball can roll up: a step under its middle. A rise of this or more is a wall. */
const CLIMB = KIND_RADIUS[BALL] * 0.95;
/** How much room it wants between its ball and anything moving, as it passes, and how long it waits for that at most, in seconds. */
const MISS = 0.6,
  MOST_WAIT = 10;

/**
 * The speed to strike a ball so it arrives `distance` away still going at
 * `arrive`. The green slows a rolling ball steadily, `roll` a second, so it
 * loses the square of its speed at the same rate over every unit it goes;
 * held by a test against what the physics does.
 */
export function speedFor(distance: number, arrive: number): number {
  return Math.sqrt(arrive * arrive + 2 * ROLL.roll * distance);
}

/** How steadily the ground slows a rolling ball at a point: sand's slowing on sand, the green's elsewhere. */
function slowingAt(l: Layout, x: number, y: number): number {
  const t = tileAt(l, x, y);
  return t >= 0 && l.sand[t] ? SAND.roll : ROLL.roll;
}

/**
 * The speed to strike a ball at (x0, y0) so it arrives at (x1, y1) still
 * going at `arrive`, over whatever it rolls on: the green and sand each slow
 * it steadily, so the square of its speed falls by twice the slowing over
 * every unit of each, and the sum is taken along the line; and up a slope it
 * falls by twice gravity over the rise, and down one grows by the fall. A
 * step down is a fall, which gives it speed downward and not along, so only
 * the slope counts.
 */
export function speedAcross(l: Layout, x0: number, y0: number, x1: number, y1: number, arrive: number): number {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 0.25));
  let lost = 2 * PHYSICS.gravity * (terrainAt(l, x1, y1) - terrainAt(l, x0, y0));
  for (let k = 0; k < n; k++)
    lost += 2 * slowingAt(l, x0 + ((x1 - x0) * (k + 0.5)) / n, y0 + ((y1 - y0) * (k + 0.5)) / n) * (d / n);
  return Math.sqrt(Math.max(0, arrive * arrive + lost));
}

/**
 * How long a ball struck at `speed` from (x0, y0) takes to roll to (x1, y1),
 * or Infinity if it stops short: a quarter unit at a time, each a steady
 * slowing of the ground's and the slope's, so on the flat green it is
 * exactly `timeTo`.
 */
export function timeAlong(l: Layout, x0: number, y0: number, x1: number, y1: number, speed: number): number {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 0.25));
  const ds = d / n;
  let v = speed,
    t = 0,
    h = terrainAt(l, x0, y0);
  for (let k = 0; k < n; k++) {
    const x = x0 + ((x1 - x0) * (k + 1)) / n,
      y = y0 + ((y1 - y0) * (k + 1)) / n;
    const rise = terrainAt(l, x, y) - h;
    h += rise;
    // this piece's slowing: the ground's, and gravity's share along the slope
    const a =
      slowingAt(l, x0 + ((x1 - x0) * (k + 0.5)) / n, y0 + ((y1 - y0) * (k + 0.5)) / n) + (PHYSICS.gravity * rise) / ds;
    const left = v * v - 2 * a * ds;
    if (left < 0) return Infinity;
    const next = Math.sqrt(left);
    t += Math.abs(a) < 1e-9 ? ds / v : (v - next) / a;
    v = next;
  }
  return t;
}

/**
 * Whether a ball would come to rest at a point: on ground no steeper than
 * the ground's slowing can hold against gravity, as the physics has it: on
 * the green up to about thirteen degrees, and on sand anywhere a hole may
 * slope. The physics counts a surface's drag as well, three quarters of it;
 * none of the game's surfaces has any, so only the steady slowing is here.
 */
export function restsOn(l: Layout, x: number, y: number): boolean {
  const [sx, sy] = slopeAt(l, x, y);
  const s = Math.hypot(sx, sy);
  return s / Math.sqrt(1 + s * s) <= slowingAt(l, x, y) / PHYSICS.gravity;
}

/** How long a ball struck at `speed` takes to roll `distance`, or Infinity if it stops short of it. */
export function timeTo(distance: number, speed: number): number {
  const left = speed * speed - 2 * ROLL.roll * distance;
  return left < 0 ? Infinity : (speed - Math.sqrt(left)) / ROLL.roll;
}

/** A shot it would take, and, when it plays to a point on the way rather than the cup, the point it means to stop at. */
export interface Plan extends Shot {
  to?: { x: number; y: number };
}

export interface Skill {
  /** How far off its aim a shot goes, as a spread in radians. */
  aim: number;
  /** How far off its power, as a spread in shares of the power meant. */
  power: number;
}

export interface AutopilotOptions {
  skill?: Skill;
  /** Its own chance, for the slips, apart from the game's. */
  random?: Random;
  /** A new round when one is over, for a game played for as long as it is measured. */
  replay?: boolean;
}

export class Autopilot {
  /** Its own copy of what moves on the hole, to look ahead with without moving the game's, and the hole it is for. */
  private foresight: { hole: number; t: number; obstacles: Obstacles } | null = null;
  /** When it began waiting to strike, in game time, or -1. */
  private waitingSince = -1;

  constructor(
    readonly game: Game,
    private readonly options: AutopilotOptions = {},
  ) {}

  /** One frame: a shot if the ball is ready for one, a new round if asked for, then the game stepped. */
  step(dt: number) {
    const { game } = this;
    if (game.phase === 'over' && this.options.replay) game.newRound();
    if (game.ready) {
      const shot = this.plan();
      if (shot && this.waitingSince < 0) this.waitingSince = game.t;
      // what moves is in the way: wait, unless it has waited long enough that it never will not be
      if (shot && this.inTheWay(shot) && game.t - this.waitingSince < MOST_WAIT) {
        game.step(dt);
        return;
      }
      this.waitingSince = -1;
      if (shot) {
        const { skill, random } = this.options;
        let { angle, power } = shot;
        if (skill && random) {
          angle += spread(random) * skill.aim;
          power *= 1 + spread(random) * skill.power;
        }
        game.shoot(angle, Math.max(0.02, power));
      }
    }
    game.step(dt);
  }

  /** The shot it would take from where the ball lies, or none when no shot can be taken. */
  plan(): Plan | null {
    const { game } = this;
    if (!game.ready) return null;
    const { layout, world, ball } = game;
    const x = world.x[ball],
      y = world.y[ball];
    const path = pathToCup(layout, x, y);
    // the farthest point of the way it can see, the cup itself if it can, and if it can strike hard enough to get there:
    // straight through sand may take more than the club has
    let tx = layout.cup.x,
      ty = layout.cup.y,
      toCup = true;
    if (!clear(layout, x, y, tx, ty) || speedAcross(layout, x, y, tx, ty, ARRIVE) > game.hardest) {
      toCup = false;
      [tx, ty] = path[0] ?? [layout.cup.x, layout.cup.y];
      // and somewhere a ball comes to rest: a point on the side of a slope it would roll away from
      for (const [px, py] of path) {
        const d = Math.hypot(px - x, py - y) || 1;
        const past = d * OVERRUN.share + OVERRUN.more;
        const [ox, oy] = [px + ((px - x) / d) * past, py + ((py - y) / d) * past];
        // and near enough for the club, over what lies between: a line to it across sand may need more than it has
        if (
          clear(layout, x, y, px, py) &&
          clear(layout, px, py, ox, oy) &&
          speedAcross(layout, x, y, px, py, 0) <= game.hardest &&
          restsOn(layout, px, py)
        ) {
          tx = px;
          ty = py;
        }
      }
    }
    const speed = speedAcross(layout, x, y, tx, ty, toCup ? ARRIVE : 0);
    return {
      angle: Math.atan2(ty - y, tx - x),
      power: Math.min(1, powerFor(speed, game.hardest)),
      ...(toCup ? {} : { to: { x: tx, y: ty } }),
    };
  }

  /**
   * Whether anything that moves would be in the way of its ball, struck so,
   * as it passes: the ball followed along its line, a unit at a time, to where
   * it stops, and at each the moment it gets there, and every barrier and
   * gate put where it will be at that moment.
   */
  private inTheWay(shot: Shot): boolean {
    const { game } = this;
    const defs = game.def.obstacles ?? [];
    if (!defs.some((d) => d.kind !== 'conveyor')) return false;
    if (!this.foresight || this.foresight.hole !== game.hole || this.foresight.t > game.t)
      this.foresight = { hole: game.hole, t: game.t, obstacles: new Obstacles(defs, game.layout) };
    const ahead = this.foresight.obstacles;
    const { world, ball } = game;
    const v0 = strikeSpeed(shot.power, game.hardest);
    const reach = rollsFor(v0);
    const c = Math.cos(shot.angle),
      s = Math.sin(shot.angle);
    const r = KIND_RADIUS[BALL] + MISS;
    for (let d = 1; d < reach * 0.98; d += 1) {
      const x = world.x[ball] + c * d,
        y = world.y[ball] + s * d;
      const when = timeAlong(game.layout, world.x[ball], world.y[ball], x, y, v0);
      if (when === Infinity) break;
      ahead.update(game.t + when, 1 / 120);
      for (const p of ahead.pushers)
        if (p.z - p.hz < KIND_RADIUS[BALL] * 2 && Math.abs(x - p.x) < p.hx + r && Math.abs(y - p.y) < p.hy + r)
          return true;
    }
    return false;
  }
}

/** A spread about nought, roughly normal, from chance: the sum of three evens, scaled. */
function spread(random: Random): number {
  return (random() + random() + random() - 1.5) * 1.15;
}

/**
 * Whether a ball could roll from one point to another with grass under the
 * whole of it, and a little either side, no rise on the way too high for it
 * to roll up, and no post in the way. A drop is no matter: it rolls off.
 */
function clear(l: Layout, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const reach = KIND_RADIUS[BALL] + CLEAR;
  const nx = d ? -(y1 - y0) / d : 0,
    ny = d ? (x1 - x0) / d : 0;
  // across the whole width of the ball, not only under its middle: a ball clips a wall's corner with its side
  const was = [-reach, 0, reach].map((side) => stepAt(l, x0 + nx * side, y0 + ny * side));
  for (let s = 0; s <= d; s += 0.25) {
    const px = x0 + ((x1 - x0) * s) / (d || 1),
      py = y0 + ((y1 - y0) * s) / (d || 1);
    if (fromPosts(l, px, py) < reach) return false;
    for (const [k, side] of [-reach, 0, reach].entries()) {
      const sx = px + nx * side,
        sy = py + ny * side;
      if (!onFloor(l, sx, sy)) return false;
      const h = stepAt(l, sx, sy);
      if (h - was[k] >= CLIMB) return false;
      was[k] = h;
    }
  }
  return true;
}

/**
 * The way from (x, y) to the cup over the grass, tile to tile, as the middles
 * of the tiles it passes, nearest first and the cup last. A tile's
 * neighbours are the four beside it that are ground, not water, not a rise
 * too high to roll up from it, and with no post in them, which leaves no
 * room either side for a ball to pass. Sand costs three tiles of grass, so
 * the way goes round a bunker unless through it is much the shorter. A flood
 * back from the cup says how far each tile is, and the way goes downhill of
 * it.
 */
function pathToCup(l: Layout, x: number, y: number): [number, number][] {
  const n = l.cols * l.rows;
  const tile = (px: number, py: number) =>
    Math.floor((py - l.originY) / TILE) * l.cols + Math.floor((px - l.originX) / TILE);
  const posted = new Set(l.bumpers.map((p) => tile(p.x, p.y)));
  // each tile's step, which is what makes a wall between two tiles
  const height = (t: number) =>
    stepAt(l, l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE);
  const cost = (t: number) => (l.sand[t] ? 3 : 1);
  const far = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const cup = tile(l.cup.x, l.cup.y);
  far[cup] = 0;
  // the nearest tile not yet settled, each time: the grids are a few hundred tiles, and this is done once a shot
  for (;;) {
    let t = -1;
    for (let u = 0; u < n; u++) if (!done[u] && far[u] < Infinity && (t < 0 || far[u] < far[t])) t = u;
    if (t < 0) break;
    done[t] = 1;
    const tx = t % l.cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols]) {
      if (u < 0 || u >= n || l.solid[u] || l.water[u] || posted.has(u) || done[u]) continue;
      // back from t to u: the ball goes from u to t, which it can if t is not too far above it
      if (height(t) - height(u) >= CLIMB) continue;
      far[u] = Math.min(far[u], far[t] + cost(u));
    }
  }
  const out: [number, number][] = [];
  let t = tile(x, y);
  if (t < 0 || t >= n || far[t] === Infinity) return out;
  while (far[t] > 0) {
    const tx = t % l.cols;
    let next = t;
    for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols])
      // a move the ball can make: onto a tile no higher than it can roll up
      if (u >= 0 && u < n && far[u] < far[next] && height(u) - height(t) < CLIMB) next = u;
    if (next === t) break;
    t = next;
    out.push([l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE]);
  }
  return out;
}
