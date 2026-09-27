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
import { BALL, KIND_RADIUS, layoutOf, onFloor, type Layout } from './arena';
import { clubById, paid } from './clubs';
import { COURSE, CUP, type HoleDef } from './course';
import { makeWorld, type World } from './physics';
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
  /** When the hole done began to be shown, in game time. */
  private doneAt = 0;

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

  /** Whether a shot can be taken: a hole in play, and the ball at rest, which is when the physics has put it to sleep. */
  get ready(): boolean {
    return this.phase === 'play' && this.world.alive[this.ball] === 1 && this.world.asleep[this.ball] === 1;
  }

  /** Hole `index` begun: a world of its own, the ball on its tee, and no strokes. */
  begin(index: number) {
    this.hole = index;
    this.layout = layoutOf(this.def.map);
    this.world = makeWorld(this.layout, CUP, () => this.random());
    this.ball = this.world.spawn(BALL, this.layout.tee.x, this.layout.tee.y, KIND_RADIUS[BALL]);
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
    world.wake(ball);
    world.vx[ball] = Math.cos(angle) * speed;
    world.vy[ball] = Math.sin(angle) * speed;
    world.vz[ball] = 0;
    this.strokes++;
    this.moving = true;
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
    // the only body is the ball, so whatever the cup collects is the ball, holed
    const fell = { holed: false };
    this.world.step(dt, () => {
      fell.holed = true;
    });
    if (this.phase !== 'play') return;
    if (fell.holed) return this.done('holed');
    if (this.moving && this.ready) {
      this.moving = false;
      this.events.stopped?.(this.world.x[this.ball], this.world.y[this.ball]);
      if (this.strokes >= this.limit) this.done('pickedUp');
    }
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
   * played: the physics would move it, or swallow it, without a word.
   */
  place(x: number, y: number) {
    const { world, ball, layout } = this;
    const r = KIND_RADIUS[BALL];
    for (const [dx, dy] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ])
      if (!onFloor(layout, x + dx, y + dy))
        throw new Error(`the ball cannot be put down at ${x},${y}: not on the grass`);
    if (Math.hypot(x - layout.cup.x, y - layout.cup.y) < CLEAR_OF_CUP)
      throw new Error(`the ball cannot be put down at ${x},${y}: too near the cup`);
    if (this.phase !== 'play') throw new Error('the ball cannot be put down between holes');
    world.wake(ball);
    world.x[ball] = x;
    world.y[ball] = y;
    world.z[ball] = KIND_RADIUS[BALL];
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    this.settle();
    this.moving = false;
  }

  /** The world stepped until the ball is asleep, outside game time: a ball put down is at rest before it is played. */
  private settle() {
    for (let f = 0; f < SETTLE_FRAMES && this.world.asleep[this.ball] !== 1; f++)
      this.world.step(1 / 120, () => undefined);
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}
