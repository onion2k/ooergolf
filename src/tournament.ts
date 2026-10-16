/**
 * A tournament: one event of a tour's season, set against the course it is played on and the computer rivals of the
 * grade. `season.ts` is the arithmetic of a field (how a card is drawn, a place shared, a prize split); this file is the
 * season put together from it, handed the courses, the rosters and the table of rivals' scores in a `SeasonContext`, so
 * the game, the save and the page ask it which event is next, who is in the field and what a season's end does, and none
 * of them works those out for itself.
 *
 * A leaf, with no game and no page, and no content: the context is made from the courses by `tours.ts`, and a test makes
 * a small one of its own. Nothing here spends the game's chance. A season's transitions (an event finished, one given up,
 * the season closed) are pure functions of the season they are given and return the season that follows, so the game can
 * try a withdrawal and refuse an entry without having changed the save, and a test can run a whole season without a game.
 */
import type { TourSeason } from './career';
import type { HoleDef } from './course';
import type { FieldTable } from './field';
import type { Rival } from './rivals';
import {
  entryFee,
  fieldOf,
  meritOf,
  nextGrade,
  pointsFor,
  potOf,
  prizesFor,
  promoted,
  seasonSeed,
  standings,
  YOU,
  type Grade,
  type Merit,
  type Placed,
  type Tour,
} from './season';

/** A course an event is played on: its name, the purse its fee is made from, and its holes (which may be made when asked for). */
export interface EventCourse {
  name: string;
  purse: number;
  readonly holes: readonly HoleDef[];
}

/** Everything a season is made from that is content: the rivals' scores, each grade's rivals, and each tour's events in order. */
export interface SeasonContext {
  table: FieldTable;
  rosters: Record<Grade, readonly Rival[]>;
  tours: Record<Tour, readonly EventCourse[]>;
}

/** The event a tour's season is on: which it is (from nought), where, at what grade, and what it costs to enter. */
export interface NextEvent {
  index: number;
  course: EventCourse;
  grade: Grade;
  seed: number;
  fee: number;
}

/**
 * How many holes an event's course has, which the table of scores says without making the course (a golf course is made
 * when it is first asked for, a second or so each) and which a test holds to the course's own.
 */
export function holeCount(ctx: SeasonContext, course: EventCourse): number {
  const holes = ctx.table[course.name] as readonly unknown[] | undefined;
  if (holes === undefined) throw new Error(`the field table has no course called ${course.name}`);
  return holes.length;
}

/** How many events a tour's season has. Refuses a tour the context does not have, by name. */
export function eventsIn(ctx: SeasonContext, tour: Tour): number {
  const events = ctx.tours[tour] as readonly EventCourse[] | undefined;
  if (events === undefined) throw new Error(`there is no tour called ${String(tour)}`);
  return events.length;
}

/** The event the season is on, the one after those played (a withdrawal is played). Refuses a season that has no event left. */
export function nextEvent(ctx: SeasonContext, tour: Tour, season: TourSeason): NextEvent {
  const events = eventsIn(ctx, tour);
  const index = season.played.length;
  if (index >= events) throw new Error(`the ${tour} season has played all ${events} of its events`);
  const course = ctx.tours[tour][index];
  return {
    index,
    course,
    grade: season.grade,
    seed: seasonSeed(season.begun, tour, season.grade),
    fee: entryFee(course.purse),
  };
}

/**
 * The standings of event `index` of the season: the player as `YOU` with the card they played (as far as it goes), and the
 * grade's eleven rivals with the cards the table gives them. With no card, a player who withdrew, they are not in the field
 * at all, and the rivals are placed among themselves. The cards are drawn from the season's seed, so the same season gives
 * the same field every time, and nothing here spends the game's chance. Every card is whole but the player's: to show a
 * round part way, cut the cards with `standings`.
 */
export function eventField(
  ctx: SeasonContext,
  tour: Tour,
  season: TourSeason,
  index: number,
  you: readonly number[] | null,
): Placed[] {
  const course = ctx.tours[tour][index] as EventCourse | undefined;
  if (course === undefined) throw new Error(`the ${tour} tour has no event ${index}`);
  const seed = seasonSeed(season.begun, tour, season.grade);
  const field = fieldOf(ctx.table, course.name, holeCount(ctx, course), ctx.rosters[season.grade], seed, index, {
    name: YOU,
    card: you ?? [],
  });
  return standings(you === null ? field.slice(1) : field);
}

/** The order of merit over the events the season has played: the points each entrant has won, a withdrawn event giving the player none. */
export function seasonMerit(ctx: SeasonContext, tour: Tour, season: TourSeason): Merit[] {
  return meritOf(season.played.map((card, index) => eventField(ctx, tour, season, index, card)));
}

/** A season closed: the season that follows it, the grade the player went up to (null for none), and whether they won a title. */
export interface Closed {
  season: TourSeason;
  promotedTo: Grade | null;
  title: boolean;
}

/**
 * A season whose last event is played, closed. The top three of the order of merit go up a grade (and all who share third);
 * at the championship, where there is no further to go, they stay and are given a title instead. Either way a season is
 * begun, with nothing played in it. Refuses a season that has an event left.
 */
export function closeSeason(ctx: SeasonContext, tour: Tour, season: TourSeason): Closed {
  const events = eventsIn(ctx, tour);
  if (season.played.length !== events)
    throw new Error(`the ${tour} season has played ${season.played.length} of its ${events} events, and is not over`);
  const up = promoted(seasonMerit(ctx, tour, season), YOU);
  const top = season.grade === nextGrade(season.grade);
  return {
    season: {
      grade: up ? nextGrade(season.grade) : season.grade,
      begun: season.begun + 1,
      played: [],
      titles: season.titles + (up && top ? 1 : 0),
    },
    promotedTo: up && !top ? nextGrade(season.grade) : null,
    title: up && top,
  };
}

/** A season closed if it has played all its events, and as it was if it has not: what a season given up on its last event comes to. */
export function closedIfFull(ctx: SeasonContext, tour: Tour, season: TourSeason): TourSeason {
  return season.played.length >= eventsIn(ctx, tour) ? closeSeason(ctx, tour, season).season : season;
}

/** The season after the next event is given up: a null played (the fee stays spent), and the season closed if that was its last. */
export function withdrawn(ctx: SeasonContext, tour: Tour, season: TourSeason): TourSeason {
  // a season already full (a save written by hand) is closed first, so the withdrawal is from the one that has an event left
  const open = closedIfFull(ctx, tour, season);
  return closedIfFull(ctx, tour, { ...open, played: [...open.played, null] });
}

/** What an event finished comes to for the player, before the course record, which is the game's to say. */
export interface Finished {
  /** The player's place (shared on a tie, `tied`), from 1 to the field's size. */
  place: number;
  tied: boolean;
  /** The player's share of the pot, which is no more than the pot and is not the course record's bonus. */
  prize: number;
  /** The order-of-merit points the place wins. */
  points: number;
  /** The season after the card is played: closed, and a new one begun, if this was its last event. */
  season: TourSeason;
  seasonOver: boolean;
  promotedTo: Grade | null;
  title: boolean;
}

/**
 * The next event played to its end with `card`: the player placed in the field, paid their share of the pot, given the
 * place's points, and the season moved on, or closed if it was the last.
 */
export function finishEvent(ctx: SeasonContext, tour: Tour, season: TourSeason, card: readonly number[]): Finished {
  const { index, fee } = nextEvent(ctx, tour, season);
  const field = eventField(ctx, tour, season, index, card);
  const prizes = prizesFor(field, potOf(fee));
  const at = field.findIndex((p) => p.name === YOU);
  const me = field[at];
  const played = { ...season, played: [...season.played, [...card]] };
  const over = played.played.length === eventsIn(ctx, tour);
  const closed = over ? closeSeason(ctx, tour, played) : null;
  return {
    place: me.place,
    tied: me.tied,
    prize: prizes[at],
    points: pointsFor(me.place),
    season: closed ? closed.season : played,
    seasonOver: over,
    promotedTo: closed ? closed.promotedTo : null,
    title: closed ? closed.title : false,
  };
}
