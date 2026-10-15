/**
 * The season's arithmetic: what a tournament costs and pays, how a field is placed, how the order of merit is kept and who
 * goes up a grade. A career is a season of events against eleven computer rivals, and every figure of one comes from here,
 * so the game, the save and the page ask this file and never work a place or a prize out for themselves.
 *
 * A leaf, with no game and no page: it is handed the table of rivals' scores, the rosters and the courses' hole counts, and
 * imports no content. Nothing here spends the game's chance. A rival's card is drawn from the table by a hash of the
 * season's seed, the event, the rival and the hole, so the same season always gives the same field and the leaderboard can
 * show a rival "thru n" holes by reading the first n scores of a card that already exists. Ties are as in golf: tied
 * entrants share a place, and the money of the places they span, split and rounded down.
 */
import { FIELD_SEEDS, holeScores, type FieldTable } from './field';
import { hashed } from './random';
import type { Rival } from './rivals';

/** The two tours a career is played on. Each is given a number by its place here, which a seed is made from: never reorder. */
export type Tour = 'golf' | 'mini';
export const TOURS: readonly Tour[] = ['golf', 'mini'];

/** The grades of a tour, easiest first. Each is given a number by its place here, which a seed is made from: never reorder. */
export type Grade = 'club' | 'county' | 'championship';
export const GRADES: readonly Grade[] = ['club', 'county', 'championship'];

/** The grade above, and the championship again at the top, where there is no further to go. */
export function nextGrade(grade: Grade): Grade {
  return GRADES[Math.min(GRADES.indexOf(grade) + 1, GRADES.length - 1)];
}

/** The entrants in an event: the player and eleven rivals. */
export const FIELD_SIZE = 12;

/** The entry fee is `entry` coins a point of the course's purse, and the pot is paid to the first places in `shares`. */
export const PRIZE = { entry: 25, shares: [0.5, 0.3, 0.2] } as const;

/** The fee for a course of the given purse, in whole coins. */
export function entryFee(purse: number): number {
  return Math.round(PRIZE.entry * purse);
}

/** Every entrant pays the fee, so the pot is a fee for each place in the field. */
export function potOf(fee: number): number {
  return fee * FIELD_SIZE;
}

/** Order-of-merit points by place, first to last. */
export const POINTS: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

/** How many of the order of merit go up a grade at a season's end (and all who share the last place). */
export const PROMOTED = 3;

/** A season's seed: a whole number from the seasons begun on the tour, the tour and the grade. Spends no chance. */
export function seasonSeed(begun: number, tour: Tour, grade: Grade): number {
  const t = TOURS.indexOf(tour);
  if (t < 0) throw new Error(`there is no tour called ${String(tour)}`);
  const g = GRADES.indexOf(grade);
  if (g < 0) throw new Error(`there is no grade called ${String(grade)}`);
  return Math.floor(hashed(begun, t, g) * 4294967296);
}

/**
 * A rival's card for an event on a course of `holes` holes: each hole's score is drawn from the table's histogram for the
 * rival's skill, taking the first score whose running count passes a hash of the season, event, rival and hole, as a share
 * of the rounds the table was made from. So a score that never happened is never drawn.
 */
export function rivalCard(
  table: FieldTable,
  course: string,
  holes: number,
  skill: number,
  seed: number,
  event: number,
  rival: number,
): number[] {
  const card: number[] = [];
  for (let hole = 0; hole < holes; hole++) {
    const histogram = holeScores(table, course, hole, skill);
    const target = hashed(seed, event, rival, hole) * FIELD_SEEDS;
    let seen = 0;
    let score = 0;
    for (let i = 0; i < histogram.length; i++) {
      if (histogram[i] > 0) score = i + 1;
      seen += histogram[i];
      if (seen > target) break;
    }
    if (score === 0) throw new Error(`the field table has no score for hole ${hole} of ${course} at skill ${skill}`);
    card.push(score);
  }
  return card;
}

/** One entrant in an event: a name and the scores so far, hole by hole. */
export interface Entry {
  name: string;
  card: readonly number[];
}

/** An entrant placed: its total over the holes counted, its place (shared on a tie) and whether it shares it. */
export interface Placed extends Entry {
  total: number;
  place: number;
  tied: boolean;
}

/**
 * The entries ordered by their total over the first `thru` holes (all of them when not given), a tie by name. A place is one
 * plus the number strictly better, so tied entries share one and the next is that many places on.
 */
export function standings(entries: readonly Entry[], thru: number = Infinity): Placed[] {
  const totals = entries.map((e) => ({ ...e, total: e.card.slice(0, thru).reduce((a, b) => a + b, 0) }));
  totals.sort((a, b) => a.total - b.total || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return totals.map((e) => {
    const better = totals.filter((o) => o.total < e.total).length;
    const level = totals.filter((o) => o.total === e.total).length;
    return { ...e, place: better + 1, tied: level > 1 };
  });
}

/** The entrant of the name in a field, which must be there. */
export function placeOfName(placed: readonly Placed[], name: string): number {
  const found = placed.find((p) => p.name === name);
  if (found === undefined) throw new Error(`${name} is not in the field`);
  return found.place;
}

/**
 * What each placed entrant wins of the pot, in the order given. Entrants tied across places pool the shares of the positions
 * they span (only the first three have one), split them evenly and round down, so the prizes never add to more than the pot.
 */
export function prizesFor(placed: readonly Placed[], pot: number): number[] {
  return placed.map((p) => {
    let share = 0;
    for (let position = p.place; position < p.place + sizeOf(placed, p); position++)
      share += PRIZE.shares[position - 1] ?? 0;
    // The shares are decimals and the pot is whole coins, so the pool is cleaned of float dust before it is divided.
    const pool = Math.round(share * pot * 1e6) / 1e6;
    return Math.floor(pool / sizeOf(placed, p) + 1e-9);
  });
}

/** How many entrants share this one's place (one if none). */
function sizeOf(placed: readonly Placed[], p: Placed): number {
  return placed.filter((o) => o.place === p.place).length;
}

/** The order-of-merit points of a place; tied entrants each take their shared place's, and a place past the field's takes none. */
export function pointsFor(place: number): number {
  return POINTS[place - 1] ?? 0;
}

/** An entrant's standing in the order of merit. */
export interface Merit {
  name: string;
  points: number;
  place: number;
  tied: boolean;
}

/** The order of merit over the events played so far, each as its standings: points by name, most first, a tie by name. */
export function meritOf(events: readonly (readonly Placed[])[]): Merit[] {
  const points = new Map<string, number>();
  for (const event of events) for (const p of event) points.set(p.name, (points.get(p.name) ?? 0) + pointsFor(p.place));
  const rows = [...points].map(([name, total]) => ({ name, points: total }));
  rows.sort((a, b) => b.points - a.points || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return rows.map((r) => ({
    ...r,
    place: rows.filter((o) => o.points > r.points).length + 1,
    tied: rows.filter((o) => o.points === r.points).length > 1,
  }));
}

/** Whether the entrant is within the top `PROMOTED` of the order of merit (all who share the last of them are). */
export function promoted(merit: readonly Merit[], name: string): boolean {
  const found = merit.find((m) => m.name === name);
  return found !== undefined && found.place <= PROMOTED;
}

/**
 * The field of an event: the player first, then the grade's rivals in the roster's order, each with the card the table gives
 * them on a course of `holes` holes. The player's card is as far as they have played.
 */
export function fieldOf(
  table: FieldTable,
  course: string,
  holes: number,
  rivals: readonly Rival[],
  seed: number,
  event: number,
  player: Entry,
): Entry[] {
  return [
    player,
    ...rivals.map((r, i) => ({ name: r.name, card: rivalCard(table, course, holes, r.skill, seed, event, i) })),
  ];
}
