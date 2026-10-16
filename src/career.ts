/**
 * The career: a season of tournaments on each tour. A round counts only as an event, entered for a fee and placed against
 * the computer rivals when its last hole is done (`season.ts` and `tournament.ts` say what that is worth); the best of such
 * rounds is kept as the course's record, and a round under way is kept so a reload can go on with it. None of it is for a
 * round of free play or of practice, which earns nothing and keeps nothing, so that a player may try a course without
 * spending a record on it; nor for a round of holes that are not an event's (a test's own, the title's).
 *
 * A leaf: handed numbers and the save's own shapes, it reads no game and no content.
 */
import type { KitSlots } from './items';
import type { Grade, Tour } from './season';

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
 * An event round under way: the tour it is on, the course by its name, the hole to play next (from nought, and nought from
 * the moment the fee is paid, so a reload before the first hole is done does not lose it), the card so far, whether its
 * retake is spent (never, in an event, where there is none), and whether a hole of it was picked up (which a score at the
 * limit does not say: a ball may drop on the last stroke allowed).
 */
export interface SavedRound {
  tour: Tour;
  course: string;
  hole: number;
  card: number[];
  retaken: boolean;
  pickedUp: boolean;
}

/** The course a round is played on, as the career needs it: its name, and its purse, the number the entry fee is made from. */
export interface RoundOf {
  name: string;
  purse: number;
}

/**
 * One tour's season as the save keeps it: the grade it is played at, how many seasons have been begun (which a season's
 * seed is made from), the events played so far this season, each as the player's card or null where they withdrew, and the
 * titles won at the championship.
 */
export interface TourSeason {
  grade: Grade;
  begun: number;
  played: (number[] | null)[];
  titles: number;
}

/** A tour's season before anything is played: the lowest grade, no season begun, no event played, no title. */
export function freshTourSeason(): TourSeason {
  return { grade: 'club', begun: 0, played: [], titles: 0 };
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
