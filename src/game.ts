/**
 * The game itself, without the picture or the page: a round of the course,
 * one hole at a time, the ball on it, the strokes taken and the card kept, a
 * step at a time.
 *
 * A hole is played until the ball drops into the cup, or until it has taken
 * the limit of strokes and is picked up. A moment later the next hole
 * begins, and after the last the round is over and the card is shown until a
 * new round is asked for.
 *
 * What happens is told to `events`, for whoever shows it: the browser turns
 * it into words on the screen; the fuzzer and the tests leave it out, or
 * keep a note of it. Nothing here waits on anything there, so the same game
 * runs in the page and in Node, and what the tests try is what is played.
 */
import {
  BALL,
  FASTEST,
  KIND_RADIUS,
  KNOCK,
  fromPosts,
  fromTrees,
  heightAt,
  highestTerrain,
  layoutOf,
  lieAt,
  onFloor,
  restingAbove,
  slopeAt,
  stepAt,
  strikeSpeed,
  terrainAt,
  tileAt,
  type Layout,
} from './arena';
import { BAG, PUTTER, bagClub, type BagClub } from './bag';
import { clubById, paid } from './clubs';
import { COURSE, CUP, type HoleDef } from './course';
import { strike } from './flight';
import { Obstacles } from './obstacles';
import { PHYSICS, THE_CUP, makeWorld, type World } from './physics';
import { Progress, memoryStore } from './progress';
import type { Random } from './random';
import { curveRate, spunKeep, windDirection, windPush } from './shaping';
import { LANDING, SURFACES } from './surfaces';
import { hitCanopy, treeCone, turned, type Cone } from './trees';

/** What happens, for whoever shows it. Every one may be left out. */
export interface GameEvents {
  /** Hole `index` (from nought) begun, with its par: the ball on the tee. */
  started?(index: number, par: number): void;
  /** The ball struck from (x, y), at `power` of the hardest shot. */
  struck?(power: number, x: number, y: number): void;
  /** The ball come to rest at (x, y), ready to be struck again. */
  stopped?(x: number, y: number): void;
  /**
   * A lofted ball come down at (x, y), going `speed` into the ground, on a golf hole: the first since it was struck if
   * `first`, which is where it carried to. What follows a landing (a hop, and a run out) is told of no more.
   */
  landed?(x: number, y: number, speed: number, first: boolean): void;
  /**
   * The ball knocked at (x, y): its velocity turned by `hard` units a second
   * in a step, by the rail, a post, a box, the cup or the ground it dropped
   * onto, which pushed it along the unit (dx, dy, dz). See `KNOCK`.
   */
  knocked?(hard: number, x: number, y: number, dx: number, dy: number, dz: number): void;
  /** The ball in the cup, in `strokes`, on a hole of `par`. */
  holed?(strokes: number, par: number): void;
  /** The ball lost in water at (x, y): a stroke more, and it is put back where it was struck from. */
  splash?(x: number, y: number): void;
  /** The ball on the ground out of bounds at (x, y), on a golf hole: lost as one in water is, a stroke more, and put back. */
  outOfBounds?(x: number, y: number): void;
  /** The limit reached without the ball holed: the hole scored at `strokes`, the limit. */
  pickedUp?(strokes: number, par: number): void;
  /** The last hole done: the round's strokes, and its par. */
  finished?(strokes: number, par: number): void;
  /** What a hole done paid into the save. */
  paid?(coins: number, gems: number): void;
  /** A club bought, for what it cost. */
  bought?(coins: number, gems: number): void;
  /** A club put in hand: how hard it strikes. */
  equipped?(hardest: number): void;
}

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The holes to play; the course unless told otherwise. */
  course?: readonly HoleDef[];
  /** A game to try shots in and not to play: see `Game.rehearsal`. */
  rehearsal?: boolean;
}

/** Where a round is: a hole in play, a hole done and the next about to begin, or the round over. */
export type Phase = 'play' | 'done' | 'over';

/** How many strokes over par a hole may take before the ball is picked up. */
export const LIMIT_OVER_PAR = 5;
/** How long a hole done is shown before the next begins, in seconds of game time. */
export const BETWEEN_HOLES = 2;
/**
 * How long a ball may be kept moving by the course before it may be struck
 * where it lies, in seconds: a belt carries a ball for as long as it lies on
 * it, and a round must get on. The barriers and the windmill's blades bounce
 * a ball off them and carry it no longer, but a belt still does.
 */
export const KEPT_MOVING = 10;
/**
 * How far from the cup's middle a ball may be put down: a ball's width and a
 * little clear of its edge, off the gold rim drawn round it, so a ball put
 * down is never over the hole before it is played. The cup has no pull, so
 * nothing draws a ball in from further off.
 */
export const CLEAR_OF_CUP = CUP.radius + KIND_RADIUS[BALL] + 0.5;
/** How near the ground a ball's middle is above where it would rest for it to be on the ground, and not in the air: out of bounds is lost on it. */
const ON_THE_GROUND = 0.3;
/** The clubs of the bag by their ids. */
const BAG_IDS = new Map(BAG.map((c) => [c.id, c]));
/** The most a ball is left to settle before it is played, in physics frames: far more than it takes. */
const SETTLE_FRAMES = 600;

export class Game {
  /** The holes a round is played over: the course, or a test's own. */
  course: readonly HoleDef[];
  /** Which hole is being played, from nought. */
  hole = 0;
  layout!: Layout;
  world!: World;
  /** What moves on the hole: its barriers, its windmills' gates, and its belts. */
  obstacles!: Obstacles;
  /** The canopy of each tree on the hole, which the ball's path is tested against every step: the physics has the trunks. */
  cones: Cone[] = [];
  /** Where the ball was struck from last, where water puts it back. */
  readonly lie = { x: 0, y: 0 };
  /** The ball's slot in the world. There is only ever the one. */
  ball = -1;
  /** Strokes taken on this hole. */
  strokes = 0;
  /** Each hole finished this round, what it was scored. */
  readonly card: number[] = [];
  phase: Phase = 'play';
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  /** The hardest the club that struck the ball last strikes: another put in hand while it rolls does not slow it. */
  struckWith = 0;
  /** The club of the bag in hand, on a golf hole: chosen a shot at a time, and the driver again at each tee. */
  inHand: BagClub = PUTTER;
  /**
   * The shape chosen for the next lofted shot, from minus one (a draw) to one (a fade), nought straight; and its spin,
   * from minus one (backspin) to one (topspin), nought flat. Chosen a shot at a time: put back to nought when a shot is
   * struck and at each hole. See `shaping.ts`.
   */
  shape = 0;
  spin = 0;
  /**
   * What the shot in the air was struck with, latched at the strike so that choosing the next shape while it flies
   * changes nothing of it: how fast its heading turns, in radians a second (a fade is positive), and its spin.
   */
  private flightRate = 0;
  private flightSpin = 0;
  /** The hole's wind, worked out once a hole, and how hard it pushes a ball in the air along x and along y, in yards a second a second. */
  private blowing = { x: 0, y: 0, speed: 0 };
  private windAx = 0;
  private windAy = 0;
  /** Whether the ball's next landing is the first since it was struck. */
  private firstLanding = false;
  /** Whether the ball was moving at the end of the last step: its coming to rest is told once, when it does. */
  private moving = false;
  /** When the ball was last struck, in game time: a ball kept moving long enough after it may be struck again. */
  private struckAt = 0;
  /** When the hole done began to be shown, in game time. */
  private doneAt = 0;
  /** Game time not yet stepped by the physics, less than one of its steps, and how far the physics has got. */
  private owed = 0;
  private stepped = 0;
  /** The last knock told on this hole, when in the physics' time and how hard, so what follows close on it is part of it. */
  private knockAt = -Infinity;
  private knockHard = 0;
  /** Whether the physics' next step is the first since the ball was struck. */
  private firstStep = false;
  /** Whether this is a rehearsal, a game made to try shots in, which no one plays: only it may be `trial`led. */
  private readonly rehearsing: boolean;

  constructor(
    readonly progress: Progress,
    readonly events: GameEvents = {},
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.course = options.course ?? COURSE;
    this.rehearsing = options.rehearsal === true;
    this.begin(0);
  }

  /**
   * A game of the hole in play that no one plays, to try a shot in before it is taken: its own world, chance held in the
   * middle so a shot is struck true (the scatter is a swing's and not a plan's), its own save and no one listening unless it is handed someone (what a flight is told by).
   * What it does is what this game would do to the same shot, struck true, from the same lie, since it is the same
   * game; and nothing this game has, its strokes, its time, its chance or its card, is touched by it. Cheap, a
   * millisecond or so to make, and a trial in it a fraction of one.
   */
  rehearsal(events: GameEvents = {}): Game {
    return new Game(new Progress(memoryStore()), events, { random: () => 0.5, course: [this.def], rehearsal: true });
  }

  /**
   * A rehearsal made ready for the next trial: the ball down at (x, y) as a real ball lies there (put where it is,
   * never refused for being near the cup or on a slope, since a real ball may lie so), no stroke taken, and the hole
   * begun again in every way that matters, however the last trial ended, holed or lost in the water. Only a
   * rehearsal may be tried in: a trial in a game that is played would take its card and its strokes away.
   */
  trial(x: number, y: number) {
    if (!this.rehearsing) throw new Error('a trial is made only in a rehearsal, which no one plays');
    const { world } = this;
    if (world.alive[this.ball]) world.remove(this.ball);
    this.phase = 'play';
    this.strokes = 0;
    // a ball holed in a trial is a score on the card, which a rehearsal would keep for ever
    this.card.length = 0;
    this.moving = false;
    this.firstLanding = false;
    this.firstStep = false;
    this.knockAt = -Infinity;
    this.letGoOfShape();
    this.spawnAt(x, y);
  }

  /** What was chosen for a shot, and what a shot in the air was struck with, put back to straight and flat. */
  private letGoOfShape() {
    this.shape = this.spin = this.flightRate = this.flightSpin = 0;
  }

  /** The next shot's shape, set within its limits; a number that is not one leaves it as it was. */
  setShape(v: number) {
    if (Number.isFinite(v)) this.shape = Math.max(-1, Math.min(1, v));
  }

  /** The next shot's spin, set within its limits; a number that is not one leaves it as it was. */
  setSpin(v: number) {
    if (Number.isFinite(v)) this.spin = Math.max(-1, Math.min(1, v));
  }

  /**
   * The wind on this hole: the way it pushes, as a unit vector across the ground, and how hard in miles an hour (nought for
   * calm, and for every hole of minigolf). The same object until the next hole begins, so a page may read it every frame.
   */
  get wind(): Readonly<{ x: number; y: number; speed: number }> {
    return this.blowing;
  }

  /** The hole being played. */
  get def(): HoleDef {
    return this.course[this.hole];
  }

  /** The most strokes this hole may take. */
  get limit(): number {
    return this.def.par + LIMIT_OVER_PAR;
  }

  /** The hardest the club in hand strikes: the bag's on a golf hole, and the shop's putter's on any other. */
  get hardest(): number {
    return this.layout.golf ? this.inHand.hardest : clubById(this.progress.save.club).hardest;
  }

  /**
   * Whether a shot can be taken: a hole in play, and the ball come to rest
   * since it was struck, which is when the physics has put it to sleep, or
   * when the course has kept it moving for `KEPT_MOVING`. Once at rest it
   * stays ready until it is struck, though a belt or a barrier nudge it: the
   * player's turn is not taken back.
   */
  get ready(): boolean {
    if (this.phase !== 'play' || this.world.alive[this.ball] !== 1) return false;
    if (!this.moving) return true;
    return this.world.asleep[this.ball] === 1 || this.t - this.struckAt >= KEPT_MOVING;
  }

  /** Hole `index` begun: a world of its own, the ball on its tee, and no strokes. */
  begin(index: number) {
    this.hole = index;
    this.layout = layoutOf(this.def.map, this.def.terrain);
    this.obstacles = new Obstacles(this.def.obstacles ?? [], this.layout);
    this.cones = this.layout.trees.map((t) => treeCone(t.x, t.y, heightAt(this.layout, t.x, t.y)));
    this.world = makeWorld(this.layout, CUP, () => this.random(), this.obstacles.belted);
    this.world.pushers = this.obstacles.pushers;
    this.world.belts = this.obstacles.belts;
    this.obstacles.update(this.t, 0);
    // resting on the tee, at whatever height it stands: a ball put down at the height of its own radius on a tee higher
    // than that begins inside the ground, and the physics puts it right by the shortest way, which is sideways, to the
    // nearest ground low enough, and on a hole whose ground falls away to a pond that is into the pond
    this.ball = this.world.spawn(
      BALL,
      this.layout.tee.x,
      this.layout.tee.y,
      this.restingZ(this.layout.tee.x, this.layout.tee.y),
    );
    this.lie.x = this.layout.tee.x;
    this.lie.y = this.layout.tee.y;
    this.strokes = 0;
    this.moving = false;
    this.phase = 'play';
    // a golf hole is begun with the driver, which is what a tee is for, and a minigolf hole with the putter
    this.inHand = this.layout.golf ? bagClub('driver') : PUTTER;
    this.firstLanding = false;
    // a knock on the hole before holds back none on this one
    this.knockAt = -Infinity;
    this.firstStep = false;
    // nor does a shape, a spin or a wind: the new hole's own, from its name, and none at all on minigolf
    this.letGoOfShape();
    const [wx, wy] = windDirection(this.def.name);
    // a hole of minigolf is calm whatever it is given: its ball never leaves the ground
    const speed = this.layout.golf ? (this.def.wind ?? 0) : 0;
    const push = windPush(speed);
    this.blowing = { x: wx, y: wy, speed };
    this.windAx = wx * push;
    this.windAy = wy * push;
    this.settle();
    this.events.started?.(index, this.def.par);
  }

  /** A new round from the first hole, the card cleared. */
  newRound() {
    this.card.length = 0;
    this.begin(0);
  }

  /**
   * A round of `holes` of a test's own, from the first: for a test to play or
   * look at a hole that is not on the course, such as one that slopes before
   * the physics can roll on it.
   */
  playCourse(holes: readonly HoleDef[]) {
    this.course = holes;
    this.newRound();
  }

  /**
   * A round come to hole `index`, as if the holes before it had each been
   * played in par: a state a player reaches, for a test or the fuzzer to
   * start from without playing up to it.
   */
  startAt(index: number) {
    this.card.length = 0;
    for (let h = 0; h < index; h++) this.card.push(this.course[h].par);
    this.begin(index);
  }

  /**
   * A club of the bag put in hand for the next shot, on a golf hole: whether it was, which it is not for a club that
   * is not in the bag or on a hole of minigolf. It may be chosen while the ball rolls: what is struck is struck.
   */
  pick(id: string): boolean {
    const club = BAG_IDS.get(id);
    if (!club || !this.layout.golf) return false;
    this.inHand = club;
    return true;
  }

  /**
   * The ball struck toward `angle`, at `power` of the club's hardest, held to
   * between none and all of it: the power is how far it goes, a half power
   * half as far as the hardest. On a hole of minigolf it goes along the
   * ground and rolls that far; on a golf hole the club in hand launches it at
   * its loft, from the ground it lies on, with the scatter of a swing. Refused,
   * and not counted, while the ball is moving, between holes, or for a shot of
   * no power at all.
   */
  shoot(angle: number, power: number): boolean {
    if (!this.ready || !(power > 0)) return false;
    const p = Math.min(1, power);
    const { world, ball } = this;
    this.struckWith = this.hardest;
    this.lie.x = world.x[ball];
    this.lie.y = world.y[ball];
    // a ball ready is at rest, and asleep or held by a belt: what it has of the belt's speed is not the shot's
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    if (this.layout.golf) {
      const launch = strike(this.inHand, p, angle, lieAt(this.layout, this.lie.x, this.lie.y), this.random);
      world.hit(ball, launch.vx, launch.vy, launch.vz);
      this.firstLanding = true;
      // a putt goes along the ground, where neither a shape nor a spin has anything to work on
      const lofted = this.inHand.loft > 0;
      this.flightRate = lofted ? curveRate(this.shape, this.inHand.loft) : 0;
      this.flightSpin = lofted ? this.spin : 0;
    } else {
      const speed = strikeSpeed(p, this.hardest);
      world.hit(ball, Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
    }
    // chosen for this shot, and so used up by it
    this.shape = this.spin = 0;
    this.strokes++;
    this.moving = true;
    this.struckAt = this.t;
    this.firstStep = true;
    this.events.struck?.(p, world.x[ball], world.y[ball]);
    return true;
  }

  /** One frame of `dt` seconds. */
  step(dt: number) {
    this.t += dt;
    if (this.phase === 'done' && this.t - this.doneAt >= BETWEEN_HOLES) {
      if (this.hole + 1 < this.course.length) this.begin(this.hole + 1);
      else {
        this.phase = 'over';
        this.events.finished?.(this.total, this.coursePar);
      }
    }
    // the physics a step at a time, what moves put where it is before each: a box must move less in a step than its
    // half thickness and the ball's radius, or the ball could be passed by it
    const fell = { holed: false, wet: false, out: false, x: 0, y: 0 };
    const collect = (_kind: number, x: number, y: number, _slot: number, hole: number) => {
      // the only body is the ball, so whatever leaves the world is the ball: down the cup, or out of the bottom into water
      if (hole === THE_CUP) fell.holed = true;
      else Object.assign(fell, { wet: true, x, y });
    };
    this.owed += dt;
    while (this.owed >= PHYSICS.step - 1e-9) {
      this.owed -= PHYSICS.step;
      this.stepped += PHYSICS.step;
      this.obstacles.update(this.stepped, PHYSICS.step);
      const { world, ball } = this;
      this.blow(PHYSICS.step);
      const vx = world.vx[ball],
        vy = world.vy[ball],
        vz = world.vz[ball];
      const px = world.x[ball],
        py = world.y[ball],
        pz = world.z[ball];
      world.step(PHYSICS.step, collect);
      this.canopies(px, py, pz);
      this.landing(vx, vy, vz);
      // on the ground out of bounds it is lost, as in water; in the air over the line it is not
      if (this.isOut()) {
        Object.assign(fell, { out: true, x: world.x[ball], y: world.y[ball] });
        break;
      }
      this.heldToFastest();
      this.knock(vx, vy, vz);
      if (fell.holed || fell.wet) break;
    }
    if (this.phase !== 'play') return;
    if (fell.holed) return this.done('holed');
    if (fell.wet) return this.putBack(fell.x, fell.y, (x, y) => this.events.splash?.(x, y));
    if (fell.out) return this.putBack(fell.x, fell.y, (x, y) => this.events.outOfBounds?.(x, y));
    if (this.moving && this.ready) {
      this.moving = false;
      this.events.stopped?.(this.world.x[this.ball], this.world.y[this.ball]);
      if (this.strokes >= this.limit) this.done('pickedUp');
    }
  }

  /**
   * The ball lost, in water or out of bounds: a stroke more, told of (by `tell`), and a new ball put down where the
   * last was struck from; or picked up, if that takes it to the limit. The last stroke allowed lost is picked up at
   * the limit, and the loss costs nothing past it.
   */
  private putBack(x: number, y: number, tell?: (x: number, y: number) => void) {
    this.strokes = Math.min(this.limit, this.strokes + 1);
    this.moving = false;
    tell?.(x, y);
    // a ball lost in water has left the world by the bottom; one out of bounds is still in it, and is taken out
    if (this.world.alive[this.ball]) this.world.remove(this.ball);
    this.spawnAt(this.lie.x, this.lie.y);
    if (this.strokes >= this.limit) this.done('pickedUp');
  }

  /**
   * Whether the ball is on the ground over out of bounds, on a golf hole: as near the ground as a ball resting there,
   * so one in flight over the line is not, and a hop off it is not until it lands.
   */
  private isOut(): boolean {
    const { world, ball, layout } = this;
    if (!layout.golf || !world.alive[ball]) return false;
    const x = world.x[ball],
      y = world.y[ball];
    const t = tileAt(layout, x, y);
    if (t < 0 || !layout.oob[t]) return false;
    return world.z[ball] - heightAt(layout, x, y) - restingAbove(layout, x, y, world.r[ball]) < ON_THE_GROUND;
  }

  /**
   * The ball's step just taken, from (px, py, pz), tested against the canopy of each tree, since the physics has the
   * trunks and no shape for a cone: where it first met one, it is put on its face and turned, its speed along the face
   * cut to a third and what it had into it given back at a fifth, so a drive that flies into a tree is stopped and
   * drops; and one that rose into the underside is knocked down. Told as a knock, since it turned the ball as one
   * does. A ball that missed every canopy, over the tip or under the base or round, is left as the physics has it.
   */
  private canopies(px: number, py: number, pz: number) {
    const { world, ball, cones } = this;
    if (!cones.length || !world.alive[ball]) return;
    const x = world.x[ball],
      y = world.y[ball],
      z = world.z[ball];
    const r = world.r[ball];
    // only the trees near enough to be met by this step: the canopy's width and a ball's, from either end of it
    const step = Math.hypot(x - px, y - py, z - pz);
    let first: { t: number; nx: number; ny: number; nz: number } | null = null;
    for (const c of cones) {
      const reach = c.radius + r + 2 + step;
      if (Math.abs(x - c.x) > reach || Math.abs(y - c.y) > reach) continue;
      const hit = hitCanopy(c, [px, py, pz], [x, y, z], r);
      if (hit && (!first || hit.t < first.t)) first = hit;
    }
    if (!first) return;
    const { t, nx, ny, nz } = first;
    // put on the face, a hair out of it, and turned by it: the underside is the one that looks straight down
    world.x[ball] = px + (x - px) * t + nx * 1e-3;
    world.y[ball] = py + (y - py) * t + ny * 1e-3;
    world.z[ball] = pz + (z - pz) * t + nz * 1e-3;
    const out = turned([world.vx[ball], world.vy[ball], world.vz[ball]], first);
    world.vx[ball] = out[0];
    world.vy[ball] = out[1];
    world.vz[ball] = out[2];
  }

  /**
   * The air's work on a ball in flight, over one physics step of `dt`, done before the step's velocities are read, so a
   * landing and a knock are judged by what the ball really did: the shape turns its heading, a pure rotation of its speed
   * across the ground that adds none and takes none (only until it first comes down, since a hop is not a flight), and
   * the wind adds a steady push along the way it blows. Only on a golf hole, to a ball that is moving and more than
   * `ON_THE_GROUND` above where it would rest: a ball on the ground, in the cup or in the water is left alone, and
   * so is every ball when there is neither a shape nor a wind, which is the whole of minigolf and The Range.
   */
  private blow(dt: number) {
    const { world, ball, layout } = this;
    const rate = this.firstLanding ? this.flightRate : 0;
    if ((rate === 0 && this.windAx === 0 && this.windAy === 0) || !layout.golf || !this.moving || !world.alive[ball])
      return;
    const x = world.x[ball],
      y = world.y[ball];
    if (world.z[ball] - heightAt(layout, x, y) - restingAbove(layout, x, y, world.r[ball]) <= ON_THE_GROUND) return;
    let vx = world.vx[ball],
      vy = world.vy[ball];
    if (rate !== 0) {
      // clockwise from above for a fade: the heading, from +x toward +y, grows smaller
      const c = Math.cos(rate * dt),
        s = Math.sin(rate * dt);
      [vx, vy] = [vx * c + vy * s, vy * c - vx * s];
    }
    world.vx[ball] = vx + this.windAx * dt;
    world.vy[ball] = vy + this.windAy * dt;
  }

  /**
   * A lofted ball that came down in the step just taken (from (vx, vy, vz), going into the ground on a golf hole) has
   * its landing made what the surface says it is: the physics gives every floor the one bounce, and none of the
   * scrub of a real ball's impact, so what it did is undone and done again. The speed along the ground is cut to
   * the surface's `keep`, less the steeper it came down, and the ball comes back up with the surface's `bounce` of its
   * speed into the ground, both along the ground's own slope. A ball rolling, however fast, is going into the ground by nothing near
   * `LANDING.least`, so never lands; and one that met a post's top or a box rather than the ground is left as
   * the physics has it.
   */
  private landing(vx: number, vy: number, vz: number) {
    const { world, ball, layout } = this;
    if (!layout.golf || !world.alive[ball]) return;
    const x = world.x[ball],
      y = world.y[ball];
    const [sx, sy] = slopeAt(layout, x, y);
    const lean = Math.sqrt(1 + sx * sx + sy * sy);
    const nx = -sx / lean,
      ny = -sy / lean,
      nz = 1 / lean;
    const into = -(vx * nx + vy * ny + vz * nz);
    if (into < LANDING.least) return;
    const out = world.vx[ball] * nx + world.vy[ball] * ny + world.vz[ball] * nz;
    // met the ground this step if it turned back by more than gravity turns it in a step
    if (out + into <= 2 * PHYSICS.gravity * PHYSICS.step) return;
    const r = world.r[ball];
    if (Math.abs(world.z[ball] - heightAt(layout, x, y) - restingAbove(layout, x, y, r)) > 0.3) return;
    const surface = SURFACES[lieAt(layout, x, y)];
    // along the ground, scrubbed, and more the steeper it came down; away from it, the surface's own hop
    const ax = world.vx[ball] - nx * out,
      ay = world.vy[ball] - ny * out,
      az = world.vz[ball] - nz * out;
    // a spin tells at the first landing only: after that the ball is on the ground, hopping and rolling as it always did
    const keep =
      spunKeep(surface.keep, this.firstLanding ? this.flightSpin : 0) *
      Math.exp((-LANDING.steep * into) / Math.max(1e-6, Math.hypot(ax, ay, az)));
    const tx = ax * keep,
      ty = ay * keep,
      tz = az * keep;
    const back = into * surface.bounce;
    world.vx[ball] = tx + nx * back;
    world.vy[ball] = ty + ny * back;
    world.vz[ball] = tz + nz * back;
    this.events.landed?.(x, y, into, this.firstLanding);
    this.firstLanding = false;
  }

  /**
   * The ball held to the fastest the course may throw it: a post throws a
   * ball faster than it came, and on the line between two facing each other
   * it would be thrown faster each time, without end. Along the ground only;
   * a fall is gravity's.
   */
  private heldToFastest() {
    const { world, ball } = this;
    if (!world.alive[ball]) return;
    const speed = Math.hypot(world.vx[ball], world.vy[ball]);
    // the ceiling on the flat first, which is nearly always enough, before what a fall down a slope adds to it
    if (speed <= Math.max(this.hardest, this.struckWith) * FASTEST) return;
    const most = fastest(this, world.x[ball], world.y[ball]);
    if (speed <= most) return;
    world.vx[ball] *= most / speed;
    world.vy[ball] *= most / speed;
  }

  /**
   * A knock told, if the physics' step just taken turned the ball from
   * (vx, vy, vz) by as much as `KNOCK` says one does. Only read, so the game
   * plays exactly as it would untold. A ball gone into the cup or the water in
   * the step is holed or splashed, and not knocked. The first step after a
   * strike fits a ball struck along the level to the ground under it, which on
   * a slope turns it up or down as sharply as a knock: that is the strike's,
   * and only what turns it along the ground counts.
   */
  private knock(vx: number, vy: number, vz: number) {
    const { world, ball } = this;
    const first = this.firstStep;
    this.firstStep = false;
    if (!world.alive[ball]) return;
    const dx = world.vx[ball] - vx,
      dy = world.vy[ball] - vy,
      dz = first ? 0 : world.vz[ball] - vz;
    const hard = Math.hypot(dx, dy, dz);
    if (hard < KNOCK.least) return;
    if (this.stepped - this.knockAt < KNOCK.apart && hard <= this.knockHard) return;
    this.knockAt = this.stepped;
    this.knockHard = hard;
    this.events.knocked?.(hard, world.x[ball], world.y[ball], dx / hard, dy / hard, dz / hard);
  }

  /** A new ball put down at (x, y), resting on the floor there, and left to settle until it is at rest, and it is the ball. */
  private spawnAt(x: number, y: number) {
    this.ball = this.world.spawn(BALL, x, y, this.restingZ(x, y));
    this.lie.x = x;
    this.lie.y = y;
    this.settle();
  }

  /** How high a ball's middle is, resting on the floor at (x, y). */
  private restingZ(x: number, y: number): number {
    return this.world.floorAt(x, y) + KIND_RADIUS[BALL];
  }

  /**
   * The hole finished, scored and told of, paid for, its best kept with the
   * club in hand, and the save written; the next begins in a moment.
   */
  private done(how: 'holed' | 'pickedUp') {
    const score = how === 'holed' ? this.strokes : this.limit;
    this.card.push(score);
    this.phase = 'done';
    this.doneAt = this.t;
    this.moving = false;
    this.events[how]?.(score, this.def.par);
    const save = this.progress.save;
    // nothing in a round of golf is bought, so a round of it pays nothing into the shop's coins
    const pay = this.layout.golf ? { coins: 0, gems: 0 } : paid(score, this.def.par, how === 'pickedUp');
    save.coins += pay.coins;
    save.gems += pay.gems;
    // a hole not yet holed has no best
    const best = Object.hasOwn(save.best, this.def.name) ? save.best[this.def.name] : undefined;
    if (how === 'holed' && (!best || score < best.strokes))
      save.best[this.def.name] = { strokes: score, club: save.club };
    this.persist();
    this.events.paid?.(pay.coins, pay.gems);
  }

  /** A club bought, if it is sold, not owned, and can be paid for; the save written. */
  buy(id: string): boolean {
    const save = this.progress.save;
    const club = clubById(id);
    if (club.id !== id || save.owned.includes(id) || save.coins < club.coins || save.gems < club.gems) return false;
    save.coins -= club.coins;
    save.gems -= club.gems;
    save.owned.push(id);
    this.persist();
    this.events.bought?.(club.coins, club.gems);
    return true;
  }

  /** A club owned put in hand, for the next shot; the save written. */
  equip(id: string): boolean {
    const save = this.progress.save;
    if (!save.owned.includes(id)) return false;
    save.club = id;
    this.persist();
    this.events.equipped?.(this.hardest);
    return true;
  }

  /** The strokes of the holes finished this round. */
  get total(): number {
    return this.card.reduce((a, b) => a + b, 0);
  }

  /** The par of the whole course. */
  get coursePar(): number {
    return this.course.reduce((a, h) => a + h.par, 0);
  }

  /**
   * The ball put down at (x, y), still, and left to settle: where a ball is
   * put back after water, and where a test sets a lie. Not a stroke. Refused
   * on the rail, or so near the cup that it would be drawn in before it is
   * played: the physics would move it, or swallow it, without a word. The
   * whole of it must be on grass of one height: a ball put down against a
   * raised step is pushed off it, and may go off an edge into water.
   */
  place(x: number, y: number) {
    const { world, ball, layout } = this;
    const r = KIND_RADIUS[BALL];
    const level = stepAt(layout, x, y);
    for (const [dx, dy] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      if (!onFloor(layout, x + dx, y + dy))
        throw new Error(`the ball cannot be put down at ${x},${y}: not on the grass`);
      if (stepAt(layout, x + dx, y + dy) !== level)
        throw new Error(`the ball cannot be put down at ${x},${y}: not on level grass`);
    }
    if (fromPosts(layout, x, y) < r + 0.1) throw new Error(`the ball cannot be put down at ${x},${y}: on a post`);
    if (layout.oob[tileAt(layout, x, y)]) throw new Error(`the ball cannot be put down at ${x},${y}: out of bounds`);
    if (fromTrees(layout, x, y) < r + 0.1)
      throw new Error(`the ball cannot be put down at ${x},${y}: on a tree's trunk`);
    if (Math.hypot(x - layout.cup.x, y - layout.cup.y) < CLEAR_OF_CUP)
      throw new Error(`the ball cannot be put down at ${x},${y}: too near the cup`);
    if (this.phase !== 'play') throw new Error('the ball cannot be put down between holes');
    world.wake(ball);
    world.x[ball] = x;
    world.y[ball] = y;
    world.z[ball] = this.restingZ(x, y);
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    this.settle();
    if (!world.alive[ball]) throw new Error(`the ball was lost settling at ${x},${y}`);
    this.moving = false;
    this.lie.x = x;
    this.lie.y = y;
  }

  /**
   * The world stepped until the ball is asleep, outside game time: a ball put
   * down is at rest before it is played. What moves is held still while it
   * settles, or a ball put down on a belt would be carried off it before the
   * game had begun again.
   */
  private settle() {
    const { world } = this;
    const { pushers, belts } = world;
    world.pushers = [];
    world.belts = [];
    for (let f = 0; f < SETTLE_FRAMES && world.asleep[this.ball] !== 1; f++) world.step(1 / 120, () => undefined);
    world.pushers = pushers;
    world.belts = belts;
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}

/**
 * The fastest the course may have the ball going at (x, y), along the
 * ground: half as fast again as the hardest shot of the club that struck it,
 * which is the most a post may throw it, and as much more as rolling down
 * from the hole's highest slope to here would give it. A step down is a
 * fall, and gives it speed downward, not along the ground.
 */
export function fastest(game: Game, x: number, y: number): number {
  const most = Math.max(game.hardest, game.struckWith) * FASTEST;
  const drop = Math.max(0, highestTerrain(game.layout) - terrainAt(game.layout, x, y));
  return Math.sqrt(most * most + 2 * PHYSICS.gravity * drop);
}
