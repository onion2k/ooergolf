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
import { fromTrees, lieAt, type Layout } from './arena';
import type { BagClub } from './bag';
import { DISPERSION, maxScatter } from './flight';
import type { Game } from './game';
import type { Route } from './route';
import { LIE } from './surfaces';
import { TREE } from './trees';

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
  shot(from: { x: number; y: number }, club: string, angle: number, power: number, shape = 0, spin = 0): Trial {
    const g = this.game;
    this.trials++;
    g.trial(from.x, from.y);
    g.pick(club);
    g.setShape(shape);
    g.setSpin(spin);
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

/** What the planner knows of a hole to judge a ball at rest by: its layout, and the way to the cup. */
export interface Ground {
  layout: Layout;
  route: Route;
}

/** The putts a ball on the green is, from `d` units from the cup: one at the cup, two from a long way, and between in between. */
export function putts(d: number): number {
  return 1 + (1 - Math.exp(-d / 9));
}

/** What a lie costs of the next shot, in strokes: the rough is hard to play from and the sand harder. */
const LIE_COST: Partial<Record<number, number>> = { [LIE.rough]: 0.35, [LIE.sand]: 0.55 };
/** What a ball under a tree's canopy costs of the next shot, in strokes: there is no playing it up, and it is played out. */
const UNDER_A_TREE = 0.6;

/**
 * The strokes still to go for a ball at rest at (x, y), by a golfer's rule of thumb: on the green, the putts; off it, a
 * shot to get to the green, which leaves what its accuracy leaves, and the putts from there, and a share of another
 * shot for each two hundred yards more than a hundred of the way; less by the lie it is played from, and a tree
 * over it. The way is the route's, which goes round water, out of bounds and trees, so a ball on the wrong side of a
 * lake is further off than it looks.
 */
export function strokesToGo({ layout, route }: Ground, x: number, y: number): number {
  const lie = lieAt(layout, x, y);
  const d = Math.hypot(x - layout.cup.x, y - layout.cup.y);
  if (lie === LIE.green) return putts(d);
  let way = route.distance(x, y);
  if (!Number.isFinite(way)) way = d * 1.6;
  const under = layout.trees.length && fromTrees(layout, x, y) + TREE.trunk < TREE.radius ? UNDER_A_TREE : 0;
  return 1 + putts(0.06 * way + 4) + Math.max(0, way - 100) / 220 + (LIE_COST[lie] ?? 0) + under;
}

/** A shot to try: a club and a first guess at its aim and power, and the place it is meant to come to rest. */
export interface Candidate {
  club: BagClub;
  guess: { angle: number; power: number };
  target: { x: number; y: number };
}

/** The candidate chosen: its aim, its power, and the trial of them struck true. */
export interface Chosen {
  index: number;
  angle: number;
  power: number;
  trial: Trial;
}

/** How much better a shot must be, in strokes, to be taken before one earlier in the list: the list is in the order to prefer. */
const AS_GOOD = 0.06;
/** How many shots are looked at more closely, at most, for what they do when the swing is not true. */
const LOOKED_AT = 4;
/** How much of a shot's worth is what it does struck true, and how much each of the three ways it may go wrong shares. */
const TRUE_SHARE = 0.4;

/** What a trial is worth, in strokes still to go: nothing for a ball that dropped, the stroke again and one more for one lost. */
export function worth(ground: Ground, from: { x: number; y: number }, t: Trial): number {
  if (t.holed) return 0;
  if (t.lost) return strokesToGo(ground, from.x, from.y) + 1;
  return strokesToGo(ground, t.x, t.y);
}

/**
 * The shot to take, of `candidates`, in the order to prefer them: each corrected in the rehearsal until it comes to
 * rest on its target, or drops, or as near as the trials allow; each judged by where its true shot comes to rest; and the
 * best few judged again by what they do a little to either side and a little short, as a swing's scatter has them, so a
 * shot that is fine struck true and lost in the water struck a hair off is not the one taken. Of those about as good the
 * earliest in the list is the choice. Null where there is nothing to choose from.
 */
export function choose(
  rehearsal: Rehearsal,
  ground: Ground,
  from: { x: number; y: number },
  candidates: Candidate[],
): Chosen | null {
  const lie = lieAt(ground.layout, from.x, from.y);
  const tried = candidates.map((c, index) => {
    const r = refine(rehearsal, from, c.target, c.club, c.guess);
    return { index, c, r, main: worth(ground, from, r.trial) };
  });
  const order = tried.slice().sort((a, b) => a.main - b.main || a.index - b.index);
  const judged: { index: number; e: number }[] = [];
  for (const cand of order.slice(0, LOOKED_AT)) {
    const { c, r } = cand;
    let e = cand.main;
    // a club with no scatter is as good struck a little off as struck true, and a ball lost is lost already
    if (!r.trial.lost && c.club.spread > 0) {
      const delta = 0.5 * maxScatter(c.club, lie, r.power);
      const short = r.power * (1 - DISPERSION.loss * r.power);
      const off = [
        rehearsal.shot(from, c.club.id, r.angle - delta, r.power),
        rehearsal.shot(from, c.club.id, r.angle + delta, r.power),
        rehearsal.shot(from, c.club.id, r.angle, short),
      ];
      e = TRUE_SHARE * cand.main + ((1 - TRUE_SHARE) / 3) * off.reduce((sum, t) => sum + worth(ground, from, t), 0);
    }
    judged.push({ index: cand.index, e });
    // no need to look further if the best so far is better than the next shot is even struck true
    if (judged.length >= order.length || Math.min(...judged.map((j) => j.e)) <= order[judged.length].main) break;
  }
  const best = Math.min(...judged.map((j) => j.e));
  if (!Number.isFinite(best)) return null;
  const pick = judged.filter((j) => j.e <= best + AS_GOOD).sort((a, b) => a.index - b.index)[0];
  const { r } = tried[pick.index];
  if (r.miss === Infinity) return null;
  return { index: pick.index, angle: r.angle, power: r.power, trial: r.trial };
}
