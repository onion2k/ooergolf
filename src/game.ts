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
import { BALL, KIND_RADIUS, layoutOf, onFloor, tileAt, type Layout } from './arena';
import { clubById, paid } from './clubs';
import { COURSE, CUP, type HoleDef } from './course';
import { Obstacles } from './obstacles';
import { PHYSICS, makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';

/** What happens, for whoever shows it. Every one may be left out. */
export interface GameEvents {
  /** Hole `index` (from nought) begun, with its par: the ball on the tee. */
  started?(index: number, par: number): void;
  /** The ball struck from (x, y), at `power` of the hardest shot. */
  struck?(power: number, x: number, y: number): void;
  /** The ball come to rest at (x, y), ready to be struck again. */
  stopped?(x: number, y: number): void;
  /** The ball in the cup, in `strokes`, on a hole of `par`. */
  holed?(strokes: number, par: number): void;
  /** The ball lost in water at (x, y): a stroke more, and it is put back where it was struck from. */
  splash?(x: number, y: number): void;
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
}

/** Where a round is: a hole in play, a hole done and the next about to begin, or the round over. */
export type Phase = 'play' | 'done' | 'over';

/** How many strokes over par a hole may take before the ball is picked up. */
export const LIMIT_OVER_PAR = 5;
/** How long a hole done is shown before the next begins, in seconds of game time. */
export const BETWEEN_HOLES = 2;
/**
 * How long a ball may be kept moving by the course before it may be struck
 * where it lies, in seconds: a ball held against a sliding barrier's face is
 * carried to and fro with it and never comes to rest, and a round must get
 * on. The physics' boxes of 0.4.0 bounce a ball off rather than carry it.
 */
export const KEPT_MOVING = 10;
/**
 * How far from the cup's middle a ball may be put down: clear of the pull the
 * physics has toward a hole, which reaches this far past its rim, so a ball
 * put down is never drawn into the cup before it is played.
 */
export const CLEAR_OF_CUP = CUP.radius + 2.6;
/** The most a ball is left to settle before it is played, in physics frames: far more than it takes. */
const SETTLE_FRAMES = 600;

export class Game {
  readonly course: readonly HoleDef[];
  /** Which hole is being played, from nought. */
  hole = 0;
  layout!: Layout;
  world!: World;
  /** What moves on the hole: its barriers, its windmills' gates, and its belts. */
  obstacles!: Obstacles;
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
  /** Whether the ball was moving at the end of the last step: its coming to rest is told once, when it does. */
  private moving = false;
  /** When the ball was last struck, in game time: a ball kept moving long enough after it may be struck again. */
  private struckAt = 0;
  /** When the hole done began to be shown, in game time. */
  private doneAt = 0;
  /** Game time not yet stepped by the physics, less than one of its steps, and how far the physics has got. */
  private owed = 0;
  private stepped = 0;

  constructor(
    readonly progress: Progress,
    readonly events: GameEvents = {},
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.course = options.course ?? COURSE;
    this.begin(0);
  }

  /** The hole being played. */
  get def(): HoleDef {
    return this.course[this.hole];
  }

  /** The most strokes this hole may take. */
  get limit(): number {
    return this.def.par + LIMIT_OVER_PAR;
  }

  /** The hardest the club in hand strikes. */
  get hardest(): number {
    return clubById(this.progress.save.club).hardest;
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
    this.layout = layoutOf(this.def.map);
    this.world = makeWorld(this.layout, CUP, () => this.random());
    this.obstacles = new Obstacles(this.def.obstacles ?? [], this.layout);
    this.world.pushers = this.obstacles.pushers;
    this.world.belts = this.obstacles.belts;
    this.obstacles.update(this.t, 0);
    this.ball = this.world.spawn(BALL, this.layout.tee.x, this.layout.tee.y, KIND_RADIUS[BALL]);
    this.lie.x = this.layout.tee.x;
    this.lie.y = this.layout.tee.y;
    this.strokes = 0;
    this.moving = false;
    this.phase = 'play';
    this.settle();
    this.events.started?.(index, this.def.par);
  }

  /** A new round from the first hole, the card cleared. */
  newRound() {
    this.card.length = 0;
    this.begin(0);
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
   * The ball struck along the ground toward `angle`, at `power` of the
   * hardest shot, held to between none and all of it. Refused, and not
   * counted, while the ball is moving, between holes, or for a shot of no
   * power at all.
   */
  shoot(angle: number, power: number): boolean {
    if (!this.ready || !(power > 0)) return false;
    const p = Math.min(1, power);
    const { world, ball } = this;
    const speed = p * this.hardest;
    this.lie.x = world.x[ball];
    this.lie.y = world.y[ball];
    world.wake(ball);
    world.vx[ball] = Math.cos(angle) * speed;
    world.vy[ball] = Math.sin(angle) * speed;
    world.vz[ball] = 0;
    this.strokes++;
    this.moving = true;
    this.struckAt = this.t;
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
    // the physics a step at a time, what moves put where it is before each, so the cup can be watched between them
    const fell = { holed: false, wet: false, x: 0, y: 0 };
    const { cup } = this.layout;
    const collect = (_kind: number, x: number, y: number) => {
      // the only body is the ball, so whatever leaves the world is the ball: down the cup, or into water
      if (Math.hypot(x - cup.x, y - cup.y) <= CUP.radius + KIND_RADIUS[BALL]) fell.holed = true;
      else Object.assign(fell, { wet: true, x, y });
    };
    this.owed += dt;
    while (this.owed >= PHYSICS.step - 1e-9) {
      this.owed -= PHYSICS.step;
      this.stepped += PHYSICS.step;
      this.obstacles.update(this.stepped, PHYSICS.step);
      if (this.phase === 'play' && this.dropping()) {
        fell.holed = true;
        break;
      }
      this.world.step(PHYSICS.step, collect);
      if (fell.holed || fell.wet) break;
    }
    if (this.phase !== 'play') return;
    if (fell.holed) return this.done('holed');
    if (fell.wet) return this.splashed(fell.x, fell.y);
    if (this.moving && this.ready) {
      this.moving = false;
      this.events.stopped?.(this.world.x[this.ball], this.world.y[this.ball]);
      if (this.strokes >= this.limit) this.done('pickedUp');
    }
  }

  /**
   * The ball lost in water: a stroke more, told of, and a new ball put down
   * where the last was struck from; or picked up, if that takes it to the
   * limit.
   */
  private splashed(x: number, y: number) {
    this.strokes++;
    this.moving = false;
    this.events.splash?.(x, y);
    this.ball = this.world.spawn(BALL, this.lie.x, this.lie.y, this.restingZ(this.lie.x, this.lie.y));
    this.settle();
    if (this.strokes >= this.limit) this.done('pickedUp');
  }

  /**
   * Whether the ball will be in the cup after the physics' next step, with
   * its middle below the grass inside the cup's radius; if so it is taken
   * out of the world, holed. That is where the physics traps a ball in a
   * cup, to collect it further down; but artshape-physics 0.3.0, given the
   * floor's heights, takes a ball below the floor of its own tile to be in
   * rock, and puts it out on the nearest tile lower down, which is water if
   * there is some near. So the game takes the ball the step before the
   * physics would trap it, and before it can be thrown. 0.4.0 fixes the
   * physics, and this goes.
   */
  private dropping(): boolean {
    const { world, ball, layout } = this;
    if (!world.alive[ball]) return false;
    const h = PHYSICS.step;
    const z = world.z[ball] + world.vz[ball] * h - (PHYSICS.gravity * h * h) / 2;
    if (z >= 0) return false;
    const x = world.x[ball] + world.vx[ball] * h,
      y = world.y[ball] + world.vy[ball] * h;
    if (Math.hypot(x - layout.cup.x, y - layout.cup.y) >= CUP.radius) return false;
    world.remove(ball);
    return true;
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
    const pay = paid(score, this.def.par, how === 'pickedUp');
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
    const level = layout.floor[tileAt(layout, x, y)];
    for (const [dx, dy] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      if (!onFloor(layout, x + dx, y + dy))
        throw new Error(`the ball cannot be put down at ${x},${y}: not on the grass`);
      if (layout.floor[tileAt(layout, x + dx, y + dy)] !== level)
        throw new Error(`the ball cannot be put down at ${x},${y}: not on level grass`);
    }
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
