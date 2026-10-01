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
  lieAt,
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
import { BAG, PUTTER, bagClub, type BagClub } from './bag';
import type { HoleDef } from './course';
import { carryFrom } from './flight';
import type { Game } from './game';
import { Obstacles } from './obstacles';
import { PHYSICS } from './physics';
import { choose, Rehearsal, type Candidate } from './planner';
import { Route } from './route';
import type { Random } from './random';
import type { Shot } from './shot';
import { windReach } from './shaping';
import { LIE, type Lie } from './surfaces';

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

/**
 * A shot it would take, and, when it plays to a point on the way rather than the cup, the point it means to stop at;
 * and, on a golf hole, the club of the bag it means to strike it with.
 */
export interface Plan extends Shot {
  to?: { x: number; y: number };
  club?: string;
  /**
   * On a golf hole, where a rehearsal of the shot, struck true, says the ball will come to rest, or that it will drop
   * in the cup: what the plan expects, which is what happens when the swing is true.
   */
  expect?: { x: number; y: number; holed: boolean };
}

/** The farthest the putter is tried from the fairway or the tee, in units: a chip and run, which it rolls out as far as. */
const CHIP_AND_RUN = 45;
/** A lay-up is at a share of a club's full reach along the route, for the clubs that fall short of the cup by less than this share of the way, and how many are tried. */
const LAY_UP = { share: 0.94, within: 0.98, most: 4 };

/**
 * How far a lofted ball runs on after it lands, as a share of its carry, by the club's loft in degrees: a driver runs
 * on about an eighth of it, a wedge a thirtieth. A rough estimate from what golfers know of a ball coming down steeply
 * and not from the game's own tables, which are what it is measuring: it lands short of the cup by a stroke's worth of
 * roll, and a putt finishes the hole.
 */
function runOn(loft: number): number {
  return Math.max(0.01, 0.15 - 0.0025 * loft);
}

/**
 * How much further the hole's wind carries a full swing of `club` toward `angle`, in yards: a tail wind adds and a head
 * wind takes off, the share of the wind along the line, and nothing across it (which only turns the shot aside, for the
 * planner's trials to find). Nought, to the digit, where the hole is calm, so a calm hole is planned as it was.
 */
export function windCarry(game: Game, club: BagClub, lie: Lie, angle: number): number {
  const { x, y, speed } = game.wind;
  if (!(speed > 0)) return 0;
  const along = speed * (x * Math.cos(angle) + y * Math.sin(angle));
  return Math.sign(along) * windReach(club, 1, Math.abs(along), lie);
}

/**
 * The arithmetic's shots on a golf hole from (x, y), best first, as guesses for the planner to correct: from the green,
 * the putt, at the speed that arrives at the cup gently enough to drop; from anywhere else the two shortest clubs that
 * reach the cup from the ground the ball lies on, each at the power that lands it short of the cup by what it will run
 * on (or, for a distance none reaches, the longest club, flat out), and the putter too when the cup is a chip and run
 * away from a tee or the fairway. What the autopilot planned before it tried its shots, and the first guess still.
 */
export function golfCandidates(game: Game, x: number, y: number): Plan[] {
  const { layout } = game;
  const dx = layout.cup.x - x,
    dy = layout.cup.y - y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const lie = lieAt(layout, x, y);
  const putt = (): Plan => {
    const speed = speedAcross(layout, x, y, layout.cup.x, layout.cup.y, ARRIVE);
    return { angle, power: Math.min(1, powerFor(speed, PUTTER.hardest)), club: PUTTER.id };
  };
  if (lie === LIE.green) return [putt()];
  // from the shortest club to the longest, those that reach; and the longest, flat out, for a distance none does
  const reaching: Plan[] = [];
  for (const club of BAG.filter((c) => c !== PUTTER).reverse()) {
    const reach = (carryFrom(club, 1, lie) + windCarry(game, club, lie, angle)) * (1 + runOn(club.loft));
    if (reach >= distance) reaching.push({ angle, power: distance / reach, club: club.id });
  }
  const out = reaching.length ? reaching.slice(0, 2) : [{ angle, power: 1, club: BAG[0].id }];
  if ((lie === LIE.tee || lie === LIE.fairway) && distance <= CHIP_AND_RUN) {
    const roll = putt();
    if (speedAcross(layout, x, y, layout.cup.x, layout.cup.y, ARRIVE) <= PUTTER.hardest) out.push(roll);
  }
  return out;
}

/**
 * The shots that lay up, from (x, y) on a golf hole: for each of the longest few clubs that do not reach the cup by the
 * way it has to be played, a shot at the place on the route a full swing of it comes to, so a dogleg is turned at its
 * corner and a hazard is stopped short of, and never a place that is on no way. None where the cup is in reach of every
 * club, or the ball has no way to it.
 */
export function golfLayUps(game: Game, route: Route, x: number, y: number): Candidate[] {
  const { layout } = game;
  const lie = lieAt(layout, x, y);
  const way = route.distance(x, y);
  if (!Number.isFinite(way) || lie === LIE.green) return [];
  const out: Candidate[] = [];
  const bearing = Math.atan2(layout.cup.y - y, layout.cup.x - x);
  for (const club of BAG.filter((c) => c !== PUTTER).reverse()) {
    const reach = (carryFrom(club, 1, lie) + windCarry(game, club, lie, bearing)) * (1 + runOn(club.loft));
    if (reach >= way * LAY_UP.within) continue;
    const to = route.waypoint(x, y, reach * LAY_UP.share);
    const distance = Math.hypot(to.x - x, to.y - y);
    out.push({
      club,
      guess: { angle: Math.atan2(to.y - y, to.x - x), power: Math.min(1, distance / reach) },
      target: to,
    });
  }
  // the longest few, longest first: the farthest a ball can be got, and then the sorts of distance short of that
  return out.slice(-LAY_UP.most).reverse();
}

/** The arithmetic's first shot on a golf hole from (x, y): the one the planner starts from, and what the autopilot took before it tried its shots. */
export function golfGuess(game: Game, x: number, y: number): Plan {
  return golfCandidates(game, x, y)[0];
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
  /** Its rehearsal of the golf hole in play, and the trials struck in the rehearsals it has let go of. */
  private rehearsing: { def: HoleDef; rehearsal: Rehearsal } | null = null;
  private spent = 0;
  /** The route to the cup on the golf hole in play. */
  private ways: { def: HoleDef; route: Route } | null = null;
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
        // a golf hole's club, put in hand before the shot is taken
        if (shot.club) game.pick(shot.club);
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
    if (layout.golf) return this.golfPlan(x, y);
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
   * The shot on a golf hole, tried before it is taken: the arithmetic's candidates (the two shortest clubs that reach,
   * and the putter for a chip and run) at the cup, and the longest clubs laid up at places on the way to it, each corrected
   * in a rehearsal until its ball rests where it is meant to or drops in the cup, and judged by where it comes to rest
   * and by what it does a little off (`choose`): so a dogleg is played round, a lake carried or laid up short of, and a
   * tree gone over or round. From the green it is the putt, as it was.
   */
  private golfPlan(x: number, y: number): Plan {
    const { game } = this;
    const { layout } = game;
    const lie = lieAt(layout, x, y);
    const guesses = golfCandidates(game, x, y);
    if (lie === LIE.green) return guesses[0];
    const route = this.routeOf();
    const from = { x, y };
    // the shots at the cup, by the arithmetic, and the shots that lay up on the way to it
    // in the order to prefer them where they are about as good: the putter, which scatters not at all, and then the shortest club
    const atTheCup = guesses.map((g) => ({ club: bagClub(g.club!), guess: g, target: layout.cup }));
    const candidates: Candidate[] = [
      ...atTheCup.filter((c) => c.club === PUTTER),
      ...atTheCup.filter((c) => c.club !== PUTTER),
      ...golfLayUps(game, route, x, y),
    ];
    const chosen = choose(this.rehearse(), { layout, route }, from, candidates);
    // no shot came to rest anywhere, every one lost: the arithmetic's, which is what it was
    if (!chosen) return guesses[0];
    return {
      angle: chosen.angle,
      power: chosen.power,
      club: candidates[chosen.index].club.id,
      expect: { x: chosen.trial.x, y: chosen.trial.y, holed: chosen.trial.holed },
    };
  }

  /** The route to the cup on the hole being played, made when it is first wanted and again for another hole. */
  private routeOf(): Route {
    const { def } = this.game;
    if (!this.ways || this.ways.def !== def) this.ways = { def, route: new Route(this.game.layout) };
    return this.ways.route;
  }

  /** The rehearsal of the hole being played, made when it is first wanted and again for another hole. */
  private rehearse(): Rehearsal {
    const { def } = this.game;
    if (!this.rehearsing || this.rehearsing.def !== def) {
      // its trials go on being counted across holes
      this.spent += this.rehearsing?.rehearsal.trials ?? 0;
      this.rehearsing = { def, rehearsal: new Rehearsal(this.game.rehearsal()) };
    }
    return this.rehearsing.rehearsal;
  }

  /** How many trial shots it has struck in rehearsal, over every plan it has made: what planning has cost. */
  get trials(): number {
    return this.spent + (this.rehearsing?.rehearsal.trials ?? 0);
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
export function pathToCup(l: Layout, x: number, y: number): [number, number][] {
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
  const from = tile(x, y);
  if (from < 0 || from >= n) return [];
  far[cup] = 0;
  // the nearest tile not yet settled comes off a binary heap, an entry pushed each time a tile's distance falls and the
  // stale ones skipped as they come off: n log n. Looking at every tile for it, each time, was n squared, and took
  // twelve seconds a shot on a hole of a hundred thousand tiles, where the grids were a few hundred when it was written
  const keys = new Float64Array(4 * n + 1),
    items = new Int32Array(4 * n + 1);
  let size = 0;
  const push = (key: number, item: number) => {
    let i = size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      items[i] = items[parent];
      i = parent;
    }
    keys[i] = key;
    items[i] = item;
  };
  const pop = (): number => {
    const item = items[0];
    size--;
    if (size > 0) {
      const key = keys[size],
        last = items[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        items[i] = items[c];
        i = c;
      }
      keys[i] = key;
      items[i] = last;
    }
    return item;
  };
  push(0, cup);
  while (size > 0) {
    // a tile pushed again when its distance fell comes off again, later, already settled
    const t = pop();
    if (done[t]) continue;
    done[t] = 1;
    // the way is walked from the ball down, so every tile nearer the cup than it is has been settled by now
    if (t === from) break;
    const tx = t % l.cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols]) {
      if (u < 0 || u >= n || l.solid[u] || l.water[u] || posted.has(u) || done[u]) continue;
      // back from t to u: the ball goes from u to t, which it can if t is not too far above it
      if (height(t) - height(u) >= CLIMB) continue;
      const d = far[t] + cost(u);
      if (d < far[u]) {
        far[u] = d;
        push(d, u);
      }
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
