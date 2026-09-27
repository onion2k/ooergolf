/**
 * The picture stepped down on a machine that cannot keep up: a ladder of the
 * renderer's economy, each rung taking one more thing away (the particles,
 * then the shadows and the shade where things meet, then the post chain,
 * the haze and the glints), and a governor that watches how
 * long frames take and steps down a rung when they are slow and stay slow.
 *
 * It only ever steps down. A game cannot tell a machine that has caught up
 * from one that is only resting, and a picture that flickers between rungs
 * is worse than one a rung too low. A spike, or the gap while the page was
 * hidden, is not a slow machine, so the governor judges on the mean of a
 * window of frames and leaves out a frame too long to be one.
 *
 * It is handed the frames' lengths and says which rung; the page applies it.
 */
import { FULL_ECONOMY, type GameEconomy } from 'artshape-render/game/renderer';

/** How long a frame may take, on the mean, before the picture is too much for the machine: 50 frames a second. */
export const FRAME_BUDGET_MS = 20;
/** Frames longer than this are the page hidden, or a stall, and not the drawing: left out. */
const STALL_MS = 100;

/** The rungs, each what it takes away, in the order it takes them. */
export const RUNGS: readonly Partial<GameEconomy>[] = [
  {},
  { particles: false },
  { particles: false, shadows: false, occlusion: false },
  { particles: false, shadows: false, occlusion: false, post: false, effects: 0, fog: false },
];

/** The renderer's economy at a rung: everything, less what that rung takes away. */
export function economyFor(rung: Partial<GameEconomy>): GameEconomy {
  return { ...FULL_ECONOMY, shadows: true, ...rung };
}

export class Governor {
  rung: number;
  /** Whether the rung was chosen, and is not the governor's to change. */
  readonly held: boolean;
  /** How many frames it judges on, and waits after a step before judging again: two seconds at 60. */
  readonly window = 120;
  private sum = 0;
  private seen = 0;

  constructor(rung?: number) {
    this.held = rung !== undefined;
    this.rung = Math.max(0, Math.min(RUNGS.length - 1, rung ?? 0));
  }

  /** A frame of `ms` drawn; whether the rung has just changed. */
  frame(ms: number): boolean {
    if (this.held || ms > STALL_MS || this.rung === RUNGS.length - 1) return false;
    this.sum += ms;
    this.seen++;
    if (this.seen < this.window) return false;
    const slow = this.sum / this.seen > FRAME_BUDGET_MS;
    this.sum = this.seen = 0;
    if (slow) this.rung++;
    return slow;
  }

  get economy(): GameEconomy {
    return economyFor(RUNGS[this.rung]);
  }
}
