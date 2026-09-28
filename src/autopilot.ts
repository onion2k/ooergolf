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
import { BALL, KIND_RADIUS, ROLL, TILE, onFloor, powerFor, rollsFor, strikeSpeed, tileAt, type Layout } from './arena';
import type { Game } from './game';
import { Obstacles } from './obstacles';
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

/** How long a ball struck at `speed` takes to roll `distance`, or Infinity if it stops short of it. */
export function timeTo(distance: number, speed: number): number {
  const left = speed * speed - 2 * ROLL.roll * distance;
  return left < 0 ? Infinity : (speed - Math.sqrt(left)) / ROLL.roll;
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
  plan(): Shot | null {
    const { game } = this;
    if (!game.ready) return null;
    const { layout, world, ball } = game;
    const x = world.x[ball],
      y = world.y[ball];
    const path = pathToCup(layout, x, y);
    // the farthest point of the way it can see, the cup itself if it can
    let tx = layout.cup.x,
      ty = layout.cup.y,
      toCup = true;
    if (!clear(layout, x, y, tx, ty)) {
      toCup = false;
      [tx, ty] = path[0] ?? [layout.cup.x, layout.cup.y];
      for (const [px, py] of path) {
        const d = Math.hypot(px - x, py - y) || 1;
        const past = d * OVERRUN.share + OVERRUN.more;
        const [ox, oy] = [px + ((px - x) / d) * past, py + ((py - y) / d) * past];
        if (clear(layout, x, y, px, py) && clear(layout, px, py, ox, oy)) {
          tx = px;
          ty = py;
        }
      }
    }
    const d = Math.hypot(tx - x, ty - y);
    const speed = speedFor(d, toCup ? ARRIVE : 0);
    return { angle: Math.atan2(ty - y, tx - x), power: Math.min(1, powerFor(speed, game.hardest)) };
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
      ahead.update(game.t + timeTo(d, v0), 1 / 120);
      const x = world.x[ball] + c * d,
        y = world.y[ball] + s * d;
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
 * whole of it, and a little either side, and no rise on the way too high for
 * it to roll up. A drop is no matter: it rolls off.
 */
function clear(l: Layout, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const reach = KIND_RADIUS[BALL] + CLEAR;
  const nx = d ? -(y1 - y0) / d : 0,
    ny = d ? (x1 - x0) / d : 0;
  // across the whole width of the ball, not only under its middle: a ball clips a wall's corner with its side
  const was = [-reach, 0, reach].map((side) => l.floor[tileAt(l, x0 + nx * side, y0 + ny * side)] ?? 0);
  for (let s = 0; s <= d; s += 0.25) {
    const px = x0 + ((x1 - x0) * s) / (d || 1),
      py = y0 + ((y1 - y0) * s) / (d || 1);
    for (const [k, side] of [-reach, 0, reach].entries()) {
      const sx = px + nx * side,
        sy = py + ny * side;
      if (!onFloor(l, sx, sy)) return false;
      const h = l.floor[tileAt(l, sx, sy)];
      if (h - was[k] >= CLIMB) return false;
      was[k] = h;
    }
  }
  return true;
}

/**
 * The way from (x, y) to the cup over the grass, tile to tile, as the middles
 * of the tiles it passes, nearest first and the cup last. A tile's
 * neighbours are the four beside it that are grass, not water, and not a
 * rise too high to roll up from it; a flood back from the cup says how far
 * each tile is, and the way goes downhill of it.
 */
function pathToCup(l: Layout, x: number, y: number): [number, number][] {
  const n = l.cols * l.rows;
  const far = new Int32Array(n).fill(-1);
  const tile = (px: number, py: number) =>
    Math.floor((py - l.originY) / TILE) * l.cols + Math.floor((px - l.originX) / TILE);
  const cup = tile(l.cup.x, l.cup.y);
  const queue = [cup];
  far[cup] = 0;
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head];
    const tx = t % l.cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols]) {
      if (u < 0 || u >= n || l.solid[u] || l.water[u] || far[u] >= 0) continue;
      // back from t to u: the ball goes from u to t, which it can if t is not too far above it
      if (l.floor[t] - l.floor[u] >= CLIMB) continue;
      far[u] = far[t] + 1;
      queue.push(u);
    }
  }
  const out: [number, number][] = [];
  let t = tile(x, y);
  if (t < 0 || t >= n || far[t] < 0) return out;
  while (far[t] > 0) {
    const tx = t % l.cols;
    let next = t;
    for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols])
      // a move the ball can make: onto a tile no higher than it can roll up
      if (u >= 0 && u < n && far[u] >= 0 && far[u] < far[next] && l.floor[u] - l.floor[t] < CLIMB) next = u;
    t = next;
    out.push([l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE]);
  }
  return out;
}
