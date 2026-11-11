/**
 * The career's screens, worked out: a course's par, the top of a table with the player after it, the order of merit, each
 * tour's next event, how the field stands part way round an event, what an event came to and the words of the career. Each is
 * a function of the season, the save and the event in play, handed in, and returns what the hud draws; the page holds only the
 * state (the season the event began in, and where the last event was placed) and calls these. Without this file the arithmetic
 * lives inside `main()` closing over its variables, where no test can reach it without the page.
 *
 * Not part of the picture: it imports the hud's shapes as types alone, and the game's and the season's arithmetic as values.
 */
import { recordText, type TourSeason } from './career';
import type { Placement } from './game';
import type { Board, EventCard, Results } from './hud';
import type { Save } from './progress';
import { PRIZE, PROMOTED, TOURS, YOU, standings, type Tour } from './season';
import { closedIfFull, eventField, eventsIn, nextEvent, seasonMerit, type SeasonContext } from './tournament';

/** Where the last event finished was placed, kept from its `placed` until the card is drawn. */
export interface LastPlaced {
  result: Placement;
  tour: Tour;
  index: number;
  card: number[];
  before: TourSeason;
}

/** A course's par, from the field table, so a golf course need not be made to say it. */
export function parOf(season: SeasonContext, course: string, holes = Infinity): number {
  return season.table[course].slice(0, holes).reduce((a, h) => a + h.par, 0);
}

/** The first `n` of a table's rows, and the player's after them if theirs is not among them. */
export function topAndYou<T extends { name: string }>(rows: readonly T[], n: number): T[] {
  const top = rows.slice(0, n);
  const you = rows.find((r) => r.name === YOU);
  return you && !top.includes(you) ? [...top, you] : top;
}

/** The player's place in an order of merit, or nought where they have none yet. */
export function meritPlace(season: SeasonContext, tour: Tour, tourSeason: TourSeason): number {
  return seasonMerit(season, tour, tourSeason).find((m) => m.name === YOU)?.place ?? 0;
}

/** Each tour's next event, as its tab on the start screen shows it in the career; none in free play. */
export function eventCards(season: SeasonContext, save: Save): Partial<Record<Tour, EventCard>> | null {
  if (save.mode !== 'career') return null;
  const cards: Partial<Record<Tour, EventCard>> = {};
  for (const tour of TOURS) {
    const tourSeason = closedIfFull(season, tour, save.season[tour]);
    const next = nextEvent(season, tour, tourSeason);
    cards[tour] = {
      tour,
      grade: tourSeason.grade,
      event: next.index + 1,
      events: eventsIn(season, tour),
      course: next.course.name,
      par: parOf(season, next.course.name),
      fee: next.fee,
      pot: next.pot,
      paid: PRIZE.shares.length,
      coins: save.coins,
      merit: topAndYou(seasonMerit(season, tour, tourSeason), 4).map((m) => ({
        place: m.place,
        tied: m.tied,
        name: m.name,
        points: m.points,
        you: m.name === YOU,
      })),
      promoted: PROMOTED,
      kept: save.round?.tour === tour ? save.round.hole + 1 : null,
    };
  }
  return cards;
}

/**
 * How the field stands in the event in play, thru the holes finished: none away from an event, or before the season it began
 * in is known. `eventSeason` is the season as it stood when the event's holes began, since the game moves it on at the end.
 */
export function boardNow(
  season: SeasonContext,
  event: { tour: Tour; index: number } | null,
  card: readonly number[],
  eventSeason: TourSeason | null,
): Board | null {
  if (!event || !eventSeason) return null;
  const { tour, index } = event;
  const thru = card.length;
  const placed = standings(eventField(season, tour, eventSeason, index, card), thru);
  const par = parOf(season, season.tours[tour][index].name, thru);
  const you = placed.find((p) => p.name === YOU)!;
  const cut = placed[Math.min(PRIZE.shares.length, placed.length) - 1];
  return {
    thru,
    rows: topAndYou(placed, 3).map((p) => ({
      place: p.place,
      tied: p.tied,
      name: p.name,
      toPar: p.total - par,
      you: p.name === YOU,
    })),
    cut: cut.total - par,
    behind: placed.filter((p) => p.total > you.total).length,
  };
}

/** What an event came to, for the card at its end: the field, the place and the season, from where it was placed. */
export function resultsOf(season: SeasonContext, lastPlaced: LastPlaced | null, course: string): Results | null {
  if (!lastPlaced) return null;
  const { result, tour, index, card, before } = lastPlaced;
  const placed = eventField(season, tour, before, index, card);
  return {
    course,
    place: result.place,
    tied: result.tied,
    prize: result.prize,
    rows: topAndYou(placed, 4).map((p) => ({
      place: p.place,
      tied: p.tied,
      name: p.name,
      total: p.total,
      you: p.name === YOU,
    })),
    meritFrom: meritPlace(season, tour, before),
    meritTo: meritPlace(season, tour, { ...before, played: [...before.played, card] }),
    seasonOver: result.seasonOver,
    promotedTo: result.promotedTo,
    title: result.title,
  };
}

/** What the start screen says of the career, from the save as it stands. */
export function careerWords(save: Save) {
  return {
    mode: save.mode,
    records: Object.fromEntries(Object.entries(save.records).map(([name, r]) => [name, recordText(r)])),
    round: save.round ? { course: save.round.course, hole: save.round.hole + 1 } : null,
  };
}
