/**
 * The planner: a golf shot tried before it is taken. The autopilot's first guess at a shot is arithmetic (a club, and a
 * power from the distance and the club's loft), and it is out by whatever a real ball does that arithmetic does not know:
 * how far it runs on, that it comes down higher or lower than it left, that a slope bends its roll. This strikes the shot
 * in a rehearsal, a game of the hole that no one plays and in which chance is held still, so a trial is the shot struck
 * true, and corrects the aim and the power by where the ball came to rest until it rests on the target or drops in it.
 *
 * It is handed a rehearsal and knows nothing of the game that is played: what it does costs that game nothing, and the
 * plan is what happens, to the last digit, when the swing is true. The scatter of a real swing is the swing's, and is
 * not planned for.
 */
import type { BagClub } from './bag';
import type { Game } from './game';

/** How long a trial is let run, in seconds of game time, before the ball is taken to be at rest: far longer than any shot. */
const LONGEST = 25;
/** The frame a trial is stepped by. */
const DT = 1 / 60;

/**
 * What one trial shot came to: where the ball rested, or that it dropped into the cup, or that it was lost: into water,
 * or because it could not be struck from where it lay, as a ball put down on the rim of the cup may drop in as it
 * settles though a real one lay there, and there is then nothing to say of where a shot would have gone.
 */
export interface Trial {
  x: number;
  y: number;
  holed: boolean;
  lost: boolean;
}

/** A rehearsal of a hole to try shots in, and a count of the trials made: the cost of a plan. */
export class Rehearsal {
  /** How many trials have been made. */
  trials = 0;

  /** `game` is a rehearsal (`Game.rehearsal`), and is only ever tried in. */
  constructor(private readonly game: Game) {}

  /** The shot struck from where a ball lies at `from`, with `club`, toward `angle`, at `power`, struck true: what came of it. */
  shot(from: { x: number; y: number }, club: string, angle: number, power: number): Trial {
    const g = this.game;
    this.trials++;
    g.trial(from.x, from.y);
    g.pick(club);
    if (!g.shoot(angle, power)) return { x: from.x, y: from.y, holed: false, lost: true };
    for (let f = 0; f < LONGEST / DT && g.phase === 'play' && !g.ready; f++) g.step(DT);
    // a ball lost in water is put back and a stroke added, which is the only way a second stroke is counted here
    return { x: g.world.x[g.ball], y: g.world.y[g.ball], holed: g.phase !== 'play', lost: g.strokes > 1 };
  }
}

/** A shot corrected by trial: its aim and power, what the trial of them came to, and how far from the target that was. */
export interface Refined {
  angle: number;
  power: number;
  trial: Trial;
  /** How far from the target the ball came to rest, nought if it dropped in it. */
  miss: number;
}

/** How near the target a trial is called on it, in units: a ball this near the cup is on its rim. */
export const TOLERANCE = 0.6;
/** How many trials a shot is corrected by, at most. */
export const MOST_TRIALS = 5;
/** The least a shot's power is corrected down to: a tap. */
const TAP = 0.02;

/**
 * `guess`, a club's aim and power, corrected until a ball struck with `club` from `from` comes to rest on `target`,
 * or drops in it, or the trials are used up, and then the best of them. The power is corrected by how far along the
 * line to the target the ball came, the aim by how far across it, both from where the last trial rested: a ball that
 * rests a share of the way short wants that share more power, since how far a shot goes is very nearly how hard it
 * is struck (a secant through the last two trials was tried, and took as many), and one that rests to the left wants
 * the aim turned right by the angle it was out by. A club that cannot reach is left at full power and only its aim
 * corrected.
 */
export function refine(
  rehearsal: Rehearsal,
  from: { x: number; y: number },
  target: { x: number; y: number },
  club: BagClub,
  guess: { angle: number; power: number },
): Refined {
  const d = Math.hypot(target.x - from.x, target.y - from.y);
  const ux = (target.x - from.x) / (d || 1),
    uy = (target.y - from.y) / (d || 1);
  let { angle, power } = guess;
  let best: Refined | null = null;
  for (let k = 0; k < MOST_TRIALS; k++) {
    const trial = rehearsal.shot(from, club.id, angle, power);
    if (trial.holed) return { angle, power, trial: { ...trial, x: target.x, y: target.y }, miss: 0 };
    if (trial.lost) {
      // lost, and no way to say where it would have gone: a shorter shot, and try again
      power = Math.max(TAP, power * 0.85);
      continue;
    }
    const rx = trial.x - from.x,
      ry = trial.y - from.y;
    const along = rx * ux + ry * uy,
      across = -rx * uy + ry * ux;
    const miss = Math.hypot(along - d, across);
    if (!best || miss < best.miss) best = { angle, power, trial, miss };
    if (miss < TOLERANCE) break;
    // out of reach at full power and aimed true: nothing more to be had of the shot
    if (power >= 1 && along < d && Math.abs(across) < TOLERANCE) break;
    // the power: in proportion, since how far a shot goes is very nearly how hard it is struck
    const next = power * (d / Math.max(along, 1));
    // the aim: turned back by the angle it was out by, as seen from the start
    angle -= Math.atan2(across, Math.max(along, 1));
    power = Math.max(TAP, Math.min(1, next));
  }
  // every trial lost: nothing to say of where it would come to rest
  return (
    best ?? {
      angle: guess.angle,
      power: Math.max(TAP, power),
      trial: { x: from.x, y: from.y, holed: false, lost: true },
      miss: Infinity,
    }
  );
}
