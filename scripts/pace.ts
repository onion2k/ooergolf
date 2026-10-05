/**
 * How each course plays, by the autopilot with a player's slips: how many
 * strokes a round of it takes, over a few seeds, held to a baseline of its
 * own, both ways.
 * Fewer is as much a change as more: a hole that plays itself is a bug the
 * same as one that cannot be finished. Par is set from the same player.
 *
 * `pace-check.ts` runs it: `npm run pace` for the figures, `npm run
 * pace:check` to hold them, `-- --update` to write the baseline again.
 *
 * The figure is the mean over sixteen seeds. A round's strokes are a few
 * whole numbers, so a median jumps a whole stroke from one set of seeds to
 * the next (3 against 4, measured over four sets of sixteen), where the mean
 * held within 5% (3.38 to 3.56). The tolerance is a fifth: four times that
 * wobble, and tight enough to catch a hole made a stroke easier or harder.
 */
import { Autopilot, type Skill } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** The seeds a round is played on, and the most game minutes a round is given before it counts as stuck. */
export const CHECK = { seeds: Array.from({ length: 16 }, (_, k) => k + 1), capMinutes: 20 };
/** A player's slips: a few degrees of aim, a tenth of the power. */
export const PLAYER: Skill = { aim: 0.05, power: 0.1 };
/** How far the figure may move from the baseline, as a share of it, before the check fails. */
export const TOLERANCE = 0.2;

/** The golf courses in the order they are harder, easiest first: The Links, then the two that were built to be harder than it. */
export const HARDER = ['The Links', 'The Fells', 'The Isles'] as const;

/** How much harder, in strokes over par a hole, each of `HARDER` must be than the one before. */
export const HARDER_BY = 0.1;

/**
 * What is wrong with the order of the golf courses' figures: each course's strokes over par a hole, which says how hard the
 * pace player finds it, must rise by `HARDER_BY` down `HARDER`. A course that was not played is said, and not passed over,
 * so a gate that never reached a course cannot pass in silence.
 */
export function orderProblems(
  figures: Readonly<Partial<Record<string, number>>>,
  pars: Readonly<Partial<Record<string, number>>>,
  holes: Readonly<Partial<Record<string, number>>>,
): string[] {
  const problems: string[] = [];
  const over = (name: string) => ((figures[name] ?? 0) - (pars[name] ?? 0)) / (holes[name] ?? 1);
  let last: string | null = null;
  for (const name of HARDER) {
    if (figures[name] === undefined || pars[name] === undefined || !holes[name]) {
      problems.push(`${name} was not played, so its place in the order is not held`);
      continue;
    }
    if (last !== null && over(name) < over(last) + HARDER_BY)
      problems.push(
        `${name} (${over(name).toFixed(2)} a hole over par) is not ${HARDER_BY} a hole harder than ${last} (${over(last).toFixed(2)})`,
      );
    last = name;
  }
  return problems;
}

export interface PaceRun {
  seed: number;
  /** Strokes for the round, or what was taken when it was stopped, if it never finished. */
  strokes: number;
  /** Each hole's score. */
  card: number[];
  finished: boolean;
}

/**
 * One round of `holes`, the first course's unless told, from a seed, played
 * by the autopilot with a player's slips, until it is over or the time is up.
 */
export function paceRun(seed: number, capMinutes = CHECK.capMinutes, holes?: readonly HoleDef[]): PaceRun {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
  const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
  const frames = capMinutes * 3600;
  for (let f = 0; f < frames && game.phase !== 'over'; f++) pilot.step(DT);
  return { seed, strokes: game.total, card: [...game.card], finished: game.phase === 'over' };
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Whether a figure has moved from its baseline beyond the tolerance, either way. */
export function moved(was: number, now: number, tolerance = TOLERANCE): boolean {
  return Math.abs(now - was) > Math.abs(was) * tolerance;
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
