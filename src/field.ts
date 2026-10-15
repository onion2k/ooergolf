/**
 * The scores a field of computer rivals draws from. A rival's round is the autopilot's, and an autopilot round takes
 * 0.7 to 1.6 seconds on a golf course, so a field of eleven cannot be played on the page: without a table made ahead of
 * time every tournament would stall the main thread for seconds, or the rivals would have to be given scores that no
 * player of the course could make. `npm run field` plays the autopilot at each of five skills for `FIELD_SEEDS` rounds of
 * every course and keeps, for each hole, a histogram of the scores it took, in `field.json`. The page then draws a score
 * from a histogram by a hash, which costs nothing and spends none of the game's chance. Each hole is keyed by its hash, so
 * a course changed without the script run is caught by a test, and not left with rivals who played another hole.
 *
 * A leaf: it imports no game state and no content, and `field.json` is generated and never edited.
 */
import type { Skill } from './autopilot';

/** The rivals' skills, best first: how far off its aim a shot goes, in radians, and off its power, as a share. S1 is the pace player's. */
export const RIVAL_SKILLS: readonly Skill[] = [
  { aim: 0.025, power: 0.05 },
  { aim: 0.05, power: 0.1 },
  { aim: 0.09, power: 0.16 },
  { aim: 0.14, power: 0.24 },
  { aim: 0.2, power: 0.32 },
];

/** The rounds played at each skill on each course; a histogram's counts add up to this. */
export const FIELD_SEEDS = 32;

/** One hole of the table. */
export interface FieldHole {
  name: string;
  par: number;
  /** The most strokes a hole is scored (par plus the game's limit over par); a histogram is this long. */
  limit: number;
  /** The hole as it was when the table was made (`hashHole`). */
  hash: number;
  /** For each skill in `RIVAL_SKILLS`, how many of the rounds scored 1, 2, ... up to the limit on this hole. */
  scores: number[][];
}

/** The table: each course by name, its holes in order. */
export type FieldTable = Readonly<Record<string, readonly FieldHole[]>>;

/** The histogram of a skill's scores on a course's hole (from nought), indexed by score less one. Refuses what is not in the table, by name. */
export function holeScores(table: FieldTable, course: string, hole: number, skill: number): readonly number[] {
  const holes = table[course] as readonly FieldHole[] | undefined;
  if (holes === undefined) throw new Error(`the field table has no course called ${course}`);
  const h = holes[hole] as FieldHole | undefined;
  if (h === undefined) throw new Error(`the field table has no hole ${hole} on ${course}`);
  const s = h.scores[skill] as number[] | undefined;
  if (s === undefined) throw new Error(`the field table has no skill ${skill}`);
  return s;
}
