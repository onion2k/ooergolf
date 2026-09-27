/**
 * The game itself, without the picture or the page: the course, the ball on
 * it and the strokes taken, a step at a time.
 *
 * What happens is told to `events`, for whoever shows it: the browser turns
 * it into words on the screen; the fuzzer and the tests leave it out, or
 * keep a note of it. Nothing here waits on anything there, so the same game
 * runs in the page and in Node, and what the tests try is what is played.
 */
import { BALL, HARDEST_SHOT, KIND_RADIUS, TEE, buildRock } from './arena';
import { makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';

/** What happens, for whoever shows it. Every one may be left out. */
export interface GameEvents {
  /** The ball struck from (x, y), at `power` of the hardest shot. */
  struck?(power: number, x: number, y: number): void;
  /** The ball come to rest at (x, y), ready to be struck again. */
  stopped?(x: number, y: number): void;
}

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

/** The most a ball is left to settle on the tee before the game begins, in physics frames: far more than it takes. */
const SETTLE_FRAMES = 600;

export class Game {
  readonly world: World;
  /** The ball's slot in the world. There is only ever the one. */
  readonly ball: number;
  /** Strokes taken on this hole. */
  strokes = 0;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  /** Whether the ball was moving at the end of the last step: its coming to rest is told once, when it does. */
  private moving = false;

  constructor(
    readonly progress: Progress,
    readonly events: GameEvents = {},
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.world = makeWorld(buildRock(), () => this.random());
    this.ball = this.world.spawn(BALL, TEE.x, TEE.y, KIND_RADIUS[BALL]);
    this.settle();
  }

  /** Whether a shot can be taken: the ball at rest, which is when the physics has put it to sleep. */
  get ready(): boolean {
    return this.world.asleep[this.ball] === 1;
  }

  /**
   * The ball struck along the ground toward `angle`, at `power` of the
   * hardest shot, held to between none and all of it. Refused, and not
   * counted, while the ball is moving or for a shot of no power at all.
   */
  shoot(angle: number, power: number): boolean {
    if (!this.ready || !(power > 0)) return false;
    const p = Math.min(1, power);
    const { world, ball } = this;
    const speed = p * HARDEST_SHOT;
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
    // the course has no holes yet, so nothing falls out of the world to be collected
    this.world.step(dt, () => undefined);
    if (this.moving && this.ready) {
      this.moving = false;
      this.events.stopped?.(this.world.x[this.ball], this.world.y[this.ball]);
    }
  }

  /**
   * The ball put down at (x, y), still, and left to settle: where a ball is
   * put back after water, and where a test sets a lie. Not a stroke.
   */
  place(x: number, y: number) {
    const { world, ball } = this;
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
    for (let f = 0; f < SETTLE_FRAMES && !this.ready; f++) this.world.step(1 / 120, () => undefined);
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}
