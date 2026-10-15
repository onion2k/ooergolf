/**
 * The career: what a round of a named course is worth, besides its holes. A round played to its card pays a prize, its
 * best is kept as the course's record, and a round under way is kept so a reload can go on with it. None of it is for a
 * round of free play, which earns nothing and keeps nothing, so that a player may try a course without spending a
 * record on it; nor for a round of holes that are not a course's (a test's own, the title's), which have no name.
 *
 * A leaf: handed numbers and the save's own shapes, it reads no game and no content.
 */
import type { KitSlots } from './items';

/** How the rounds a player plays count: in the career, which pays and keeps records, or as free play, which does neither. */
export type PlayMode = 'career' | 'free';
export const PLAY_MODES: readonly PlayMode[] = ['career', 'free'];

/** A course's best round in the career: its strokes, the par it was against, the kit worn as it was finished, and when. */
export interface CourseRecord {
  strokes: number;
  par: number;
  kit: KitSlots;
  /** The day it was made, as YYYY-MM-DD, or '' where the game was not told (a game run without a page). */
  when: string;
}

/**
 * A career round under way: the course by its name, the hole to play next (from nought), the card so far, whether its
 * retake is spent, and whether a hole of it was picked up (which a score at the limit does not say: a ball may drop on
 * the last stroke allowed).
 */
export interface SavedRound {
  course: string;
  hole: number;
  card: number[];
  retaken: boolean;
  pickedUp: boolean;
}

/** The course a round is played on, as the career needs it: its name, and how many times the plain prize it pays. */
export interface RoundOf {
  name: string;
  purse: number;
}

/**
 * The prize for a round, in coins. `base` times the course's purse for finishing it, `underPar` for each stroke of the
 * round under par, and `record` for a new course record. Sized so a career round pays about two fifths again on top of
 * its holes' pay (the pace player's round of The Meadow pays 92 coins by its holes and 134 with the prize; The Links 74
 * and 104; The Old Course, over par, 45 and 85): the shop's forty-five items, about 8,000 coins, take about seventy
 * rounds where they took a hundred.
 */
export const PRIZE = { base: 20, underPar: 10, record: 25 };

/** What a round finished pays: a round with a hole picked up still pays for finishing, and never a record. */
export function prizeOf(strokes: number, par: number, purse: number, record: boolean): number {
  return Math.round(PRIZE.base * purse) + Math.max(0, par - strokes) * PRIZE.underPar + (record ? PRIZE.record : 0);
}

/** Whether a round of `strokes`, with or without a hole picked up, is a new record over `held` (none for a course never finished). */
export function isRecord(strokes: number, pickedUp: boolean, held: CourseRecord | undefined): boolean {
  return !pickedUp && (held === undefined || strokes < held.strokes);
}

/** A day as the record keeps it, YYYY-MM-DD, in the player's own time. */
export function dayOf(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** What a course's card on the start screen says of its record, beside its par: "Record 31", or nothing for none. */
export function recordText(record: CourseRecord | undefined): string {
  return record ? `Record ${record.strokes}` : '';
}
