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
 * Frames that come slowly are not frames that are slow. A browser throttled
 * to thirty a second, a low-power mode or a slow screen spaces frames out
 * while the machine sits idle between them, and stepping down for that only
 * takes the picture away for nothing: the grass, once, all of it, twelve
 * seconds in. So the governor is told two things of each frame, how long it
 * was since the last and how long this one took to draw and have the GPU
 * finish, and steps down only when the player sees too few frames a second
 * and the drawing is most of what each takes.
 *
 * It is handed the frames' lengths and says which rung; the page applies it.
 */
import { FULL_ECONOMY, type GameEconomy } from 'artshape-render/game/renderer';

/** How long a frame may take, on the mean, before the picture is too much for the machine: 50 frames a second. */
export const FRAME_BUDGET_MS = 20;
/** Frames longer than this are the page hidden, or a stall, and not the drawing: left out. */
const STALL_MS = 100;
/**
 * How much of the time between frames the drawing must take, on the mean, for the machine to be what is slow: over
 * half. A page given thirty frames a second that draws each in two milliseconds spends a fifteenth.
 */
const DRAWING_SHARE = 0.5;

/**
 * The rungs, each what it takes away, in the order it takes them.
 *
 * The grass is thinned and never given up, and it always sways: it is what the
 * course is set in, and a course set in bare ground is a different game. The
 * blades kept are the same ones the distance keeps, drawn wider as fewer are
 * kept so the field's colour holds, so a quarter of them is long grass still,
 * and the last rung is the cheapest picture that is still the same place. The
 * wind costs a blade next to nothing, and costs the picture its life.
 *
 * The edges drawn at four samples a pixel cost as much again as the rough on a
 * golf hole, so they step down with it: to the post pass, a third of the
 * price, and to none on the last, which gives up everything that can go.
 */
export const RUNGS: readonly Partial<GameEconomy>[] = [
  {},
  { particles: false, grass: 0.5, antialias: 'fxaa' },
  { particles: false, grass: 0.5, shadows: false, occlusion: false, antialias: 'fxaa' },
  {
    particles: false,
    grass: 0.25,
    shadows: false,
    occlusion: false,
    post: false,
    effects: 0,
    fog: false,
    antialias: 'none',
  },
];

/** The renderer's economy at a rung: everything, less what that rung takes away. */
export function economyFor(rung: Partial<GameEconomy>): GameEconomy {
  return { ...FULL_ECONOMY, shadows: true, grass: 1, wind: true, ...rung };
}

export class Governor {
  rung: number;
  /** Whether the rung was chosen, and is not the governor's to change. */
  readonly held: boolean;
  /** How many frames it judges on, and waits after a step before judging again: two seconds at 60. */
  readonly window = 120;
  private gaps = 0;
  private works = 0;
  private seen = 0;

  constructor(rung?: number) {
    this.held = rung !== undefined;
    this.rung = Math.max(0, Math.min(RUNGS.length - 1, rung ?? 0));
  }

  /**
   * A frame that came `gap` milliseconds after the last and took `work` to draw and have the GPU finish; whether the
   * rung has just changed. `work` is the last that was measured, which the page samples every few frames.
   */
  frame(gap: number, work: number): boolean {
    if (this.held || gap > STALL_MS || this.rung === RUNGS.length - 1) return false;
    this.gaps += gap;
    this.works += work;
    this.seen++;
    if (this.seen < this.window) return false;
    const seen = this.gaps / this.seen;
    const slow = seen > FRAME_BUDGET_MS && this.works / this.seen >= seen * DRAWING_SHARE;
    this.gaps = this.works = this.seen = 0;
    if (slow) this.rung++;
    return slow;
  }

  get economy(): GameEconomy {
    return economyFor(RUNGS[this.rung]);
  }
}
