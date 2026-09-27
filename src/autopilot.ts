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
 * It is handed the game, and knows nothing of the page.
 */
import { BALL, HARDEST_SHOT, KIND_RADIUS, ROLL, TILE, onFloor, type Layout } from './arena';
import type { Game } from './game';
import type { Random } from './random';
import type { Shot } from './shot';

/** How fast a ball it means for the cup is going when it gets there: well inside what the cup catches. */
const ARRIVE = 4;
/** What a ball loses on top of the drag before it stops: the physics' slow-speed damping, measured. */
const STOP = 1;
/** How far either side of its line the ball must have grass, beyond its own radius. */
const CLEAR = 0.3;

/**
 * The speed to strike a ball so it arrives `distance` away still going at
 * `arrive`. Under the physics' drag a rolling ball loses the same speed for
 * every unit it travels, `floorDrag` of it, so the sum is a straight line;
 * measured, and held by a test, since the rolling resistance to come will
 * change it.
 */
export function speedFor(distance: number, arrive: number): number {
  return ROLL.floorDrag * distance + arrive + STOP;
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
      for (const [px, py] of path)
        if (clear(layout, x, y, px, py)) {
          tx = px;
          ty = py;
        }
    }
    const d = Math.hypot(tx - x, ty - y);
    const speed = speedFor(d, toCup ? ARRIVE : 0);
    return { angle: Math.atan2(ty - y, tx - x), power: Math.min(1, speed / HARDEST_SHOT) };
  }
}

/** A spread about nought, roughly normal, from chance: the sum of three evens, scaled. */
function spread(random: Random): number {
  return (random() + random() + random() - 1.5) * 1.15;
}

/** Whether a ball could roll from one point to another with grass under the whole of it, and a little either side. */
function clear(l: Layout, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const reach = KIND_RADIUS[BALL] + CLEAR;
  const nx = d ? -(y1 - y0) / d : 0,
    ny = d ? (x1 - x0) / d : 0;
  for (let s = 0; s <= d; s += 0.4) {
    const px = x0 + ((x1 - x0) * s) / (d || 1),
      py = y0 + ((y1 - y0) * s) / (d || 1);
    for (const side of [-reach, 0, reach]) if (!onFloor(l, px + nx * side, py + ny * side)) return false;
  }
  return true;
}

/**
 * The way from (x, y) to the cup over the grass, tile to tile, as the middles
 * of the tiles it passes, nearest first and the cup last. A tile's
 * neighbours are the four beside it; a flood from the cup says how far each
 * tile is, and the way goes downhill of it.
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
      if (u < 0 || u >= n || l.solid[u] || far[u] >= 0) continue;
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
      if (u >= 0 && u < n && far[u] >= 0 && far[u] < far[next]) next = u;
    t = next;
    out.push([l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE]);
  }
  return out;
}
