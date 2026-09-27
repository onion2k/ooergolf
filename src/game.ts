/**
 * The game itself, without the picture or the page: the course and whatever
 * is on it, a step at a time. There is nothing on it yet: the template's
 * stub has been taken out, and the golf goes in a feature at a time.
 *
 * What happens is told to `events`, for whoever shows it: the browser turns
 * it into words on the screen; the fuzzer and the tests leave it out, or
 * keep a note of it. Nothing here waits on anything there, so the same game
 * runs in the page and in Node, and what the tests try is what is played.
 */
import { buildRock } from './arena';
import { makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';

/**
 * What happens, for whoever shows it. Every one may be left out. Nothing
 * happens on an empty course, so there is none yet: the first thing that
 * does gets a line here, and the page, the fuzzer and the tests are already
 * listening.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty until the first feature tells of something
export interface GameEvents {}

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

export class Game {
  readonly world: World;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;

  constructor(
    readonly progress: Progress,
    readonly events: GameEvents = {},
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.world = makeWorld(buildRock(), () => this.random());
  }

  /** One frame of `dt` seconds. */
  step(dt: number) {
    this.t += dt;
    // the course has no holes yet, so nothing falls out of the world to be collected
    this.world.step(dt, () => undefined);
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}
