/**
 * The tournament: which event a season is on, who is in its field, the order of merit over a season, and what a season's
 * end does. All of it from a season as the save keeps it, with no game: cards written by hand against the real table of the
 * rivals' scores and the real courses, whose holes are not made (the table says how many each has).
 */
import { describe, expect, it } from 'vitest';
import { freshTourSeason, type TourSeason } from '../src/career';
import { COURSES } from '../src/course';
import {
  GRADES,
  FIELD_SIZE,
  YOU,
  entryFee,
  meritOf,
  placeOfName,
  pointsFor,
  seasonSeed,
  standings,
  type Grade,
} from '../src/season';
import { ROSTERS } from '../src/rivals';
import {
  closeSeason,
  closedIfFull,
  eventField,
  eventsIn,
  finishEvent,
  holeCount,
  nextEvent,
  seasonMerit,
  withdrawn,
  type EventCourse,
  type SeasonContext,
} from '../src/tournament';
import { seasonContext } from '../src/tours';

const REAL = seasonContext();
/** An event of the real table that makes none of its holes: only its name, its purse and how many holes the table says. */
const eventOf = (name: string): EventCourse => {
  const c = COURSES.find((k) => k.name === name)!;
  return { name, purse: c.purse, holes: [] };
};
/** A season of one event on each tour, so the whole of a season is one card; the real rivals and the real table. */
const ONE: SeasonContext = {
  ...REAL,
  tours: { golf: [eventOf('The Links')], mini: [eventOf('The Meadow')] },
};
const season = (over: Partial<TourSeason> = {}): TourSeason => ({ ...freshTourSeason(), ...over });
/** A card of `n` holes scoring `total` in all, as even as it can be. */
const cardOf = (n: number, total: number) =>
  Array.from({ length: n }, (_, k) => Math.floor(total / n) + (k < total % n ? 1 : 0));
const meadow = REAL.table['The Meadow'].length;

describe('the tours', () => {
  it('has six events on the golf tour, the golf courses in the order the start screen shows them, and three on the mini', () => {
    expect(REAL.tours.golf.map((c) => c.name)).toEqual(COURSES.filter((c) => c.golf).map((c) => c.name));
    expect(REAL.tours.mini.map((c) => c.name)).toEqual(COURSES.filter((c) => !c.golf).map((c) => c.name));
    expect(eventsIn(REAL, 'golf')).toBe(6);
    expect(eventsIn(REAL, 'mini')).toBe(3);
    expect(() => eventsIn(REAL, 'senior' as never)).toThrow(/no tour called senior/);
  });

  it('knows how many holes a course has from the table, without making the course', () => {
    for (const course of REAL.tours.mini) expect(holeCount(REAL, course)).toBe(course.holes.length);
    expect(holeCount(REAL, REAL.tours.golf[0])).toBe(9);
    expect(() => holeCount(REAL, { name: 'Nowhere', purse: 1, holes: [] })).toThrow(/no course called Nowhere/);
  });
});

describe('the next event', () => {
  it('is the one after those played, at the season’s grade, with its seed and its fee', () => {
    const s = season({ grade: 'county', begun: 2, played: [null, [1]] });
    const next = nextEvent(REAL, 'golf', s);
    expect(next.index).toBe(2);
    expect(next.course.name).toBe(REAL.tours.golf[2].name);
    expect(next.grade).toBe('county');
    expect(next.seed).toBe(seasonSeed(2, 'golf', 'county'));
    expect(next.fee).toBe(entryFee(REAL.tours.golf[2].purse));
    // a withdrawal is played, so the event after it is next
    expect(nextEvent(REAL, 'mini', season({ played: [null] })).course.name).toBe(REAL.tours.mini[1].name);
  });

  it('is refused, by name, once all the events are played, and for a tour there is not', () => {
    expect(() => nextEvent(REAL, 'mini', season({ played: [null, null, null] }))).toThrow(/played all 3 of its events/);
    expect(() => nextEvent(REAL, 'senior' as never, season())).toThrow(/no tour called senior/);
  });
});

describe('the field of an event', () => {
  const s = season({ grade: 'club', begun: 0 });
  const links = (card: number[] | null) => eventField(REAL, 'golf', s, 0, card);

  it('is the player and the grade’s eleven rivals, placed, with the player first on their own card', () => {
    const field = links(cardOf(9, 36));
    expect(field.length).toBe(FIELD_SIZE);
    expect(field.map((p) => p.name).sort()).toEqual([YOU, ...ROSTERS.club.map((r) => r.name)].sort());
    expect(field.find((p) => p.name === YOU)!.card).toEqual(cardOf(9, 36));
    for (const p of field) expect(p.card.length, p.name).toBe(9);
  });

  it('has no player at all where they withdrew, and the rivals as they were', () => {
    const without = links(null);
    expect(without.length).toBe(FIELD_SIZE - 1);
    expect(without.some((p) => p.name === YOU)).toBe(false);
    const withYou = links(cardOf(9, 36));
    for (const p of without)
      expect(withYou.find((q) => q.name === p.name)!.card, `${p.name} plays the same either way`).toEqual(p.card);
    // and the places close up behind a player who is not there
    expect(without[0].place).toBe(1);
  });

  it('is the same every time for the same season, and another for another season, grade or event', () => {
    expect(links(cardOf(9, 36))).toEqual(links(cardOf(9, 36)));
    const cards = (f: ReturnType<typeof links>) => f.filter((p) => p.name !== YOU).map((p) => p.card.join());
    const other = (over: Partial<TourSeason>, index = 0) => cards(eventField(REAL, 'golf', season(over), index, null));
    expect(other({ begun: 1 })).not.toEqual(other({ begun: 0 }));
    expect(other({ grade: 'county' })).not.toEqual(other({}));
    expect(other({}, 1)).not.toEqual(other({}));
  });

  it('places the player among the rivals by their total, a better card ahead', () => {
    const good = links(cardOf(9, 20)).find((p) => p.name === YOU)!;
    const bad = links(cardOf(9, 90)).find((p) => p.name === YOU)!;
    expect(good.place).toBe(1);
    expect(bad.place).toBe(FIELD_SIZE);
    expect(placeOfName(links(cardOf(9, 90)), YOU)).toBe(FIELD_SIZE);
  });

  it('refuses an event the tour does not have', () => {
    expect(() => eventField(REAL, 'mini', s, 3, null)).toThrow(/no event 3/);
  });
});

describe('the order of merit over a season', () => {
  it('adds the points of the places won, each event drawn from its own field, and gives a withdrawn event no points to the player', () => {
    const played: (number[] | null)[] = [cardOf(meadow, 14), null, cardOf(meadow, 60)];
    const s = season({ played });
    const merit = seasonMerit(REAL, 'mini', s);
    const place = (k: number, card: number[] | null) => placeOfName(eventField(REAL, 'mini', s, k, card), YOU);
    const mine = merit.find((m) => m.name === YOU)!;
    expect(mine.points).toBe(pointsFor(place(0, played[0])) + pointsFor(place(2, played[2])));
    // the rivals are in it, once each, with the points of all three events
    expect(merit.length).toBe(FIELD_SIZE);
    const all = [0, 1, 2].map((k) => eventField(REAL, 'mini', s, k, played[k]));
    expect(merit).toEqual(meritOf(all));
    const rivalPoints = merit.filter((m) => m.name !== YOU).reduce((a, m) => a + m.points, 0);
    const eventPoints = (k: number) => all[k].reduce((a, p) => a + pointsFor(p.place), 0);
    expect(rivalPoints + mine.points).toBe(eventPoints(0) + eventPoints(1) + eventPoints(2));
  });

  it('is empty before an event is played, and orders by points with a tie by name', () => {
    expect(seasonMerit(REAL, 'mini', season())).toEqual([]);
    const merit = seasonMerit(REAL, 'mini', season({ played: [cardOf(meadow, 14)] }));
    expect(merit[0].name).toBe(YOU);
    for (let k = 1; k < merit.length; k++) expect(merit[k - 1].points).toBeGreaterThanOrEqual(merit[k].points);
  });
});

describe('closing a season', () => {
  /** A season of one event whose card puts the player at exactly `want`th, found by trying totals; the card and the closed season. */
  function placedAt(want: number, grade: Grade = 'club') {
    for (let begun = 0; begun < 40; begun++)
      for (let total = meadow; total < meadow * 9; total++) {
        const s = season({ grade, begun, played: [cardOf(meadow, total)] });
        const mine = seasonMerit(ONE, 'mini', s).find((m) => m.name === YOU)!;
        if (mine.place === want) return s;
      }
    throw new Error(`no card was found for the player to be ${want}th`);
  }

  it('promotes the top three of the order of merit, and not the fourth', () => {
    const third = closeSeason(ONE, 'mini', placedAt(3));
    expect(third.promotedTo).toBe('county');
    expect(third.season.grade).toBe('county');
    const fourth = closeSeason(ONE, 'mini', placedAt(4));
    expect(fourth.promotedTo).toBeNull();
    expect(fourth.season.grade).toBe('club');
    expect(fourth.title).toBe(false);
  });

  it('promotes county to the championship, and begins a new season with nothing played', () => {
    const won = closeSeason(ONE, 'mini', placedAt(1, 'county'));
    expect(won.promotedTo).toBe('championship');
    expect(won.season).toEqual({
      grade: 'championship',
      begun: placedAt(1, 'county').begun + 1,
      played: [],
      titles: 0,
    });
  });

  it('keeps the championship’s top three where they are and gives them a title, one more each time', () => {
    const s = placedAt(1, 'championship');
    const won = closeSeason(ONE, 'mini', { ...s, titles: 2 });
    expect(won.title).toBe(true);
    expect(won.promotedTo).toBeNull();
    expect(won.season.grade).toBe('championship');
    expect(won.season.titles).toBe(3);
    // and a championship season lost is no title, and no demotion either
    const lost = closeSeason(ONE, 'mini', placedAt(9, 'championship'));
    expect(lost.title).toBe(false);
    expect(lost.season.grade).toBe('championship');
    expect(lost.season.titles).toBe(0);
  });

  it('gives a player who withdrew from every event no promotion', () => {
    const closed = closeSeason(REAL, 'mini', season({ played: [null, null, null] }));
    expect(closed.promotedTo).toBeNull();
    expect(closed.season).toEqual({ grade: 'club', begun: 1, played: [], titles: 0 });
  });

  it('is refused for a season with an event left', () => {
    expect(() => closeSeason(REAL, 'mini', season({ played: [null] }))).toThrow(/played 1 of its 3 events/);
  });

  it('is closed by closedIfFull only when full, and a withdrawal that fills a season closes it', () => {
    const part = season({ played: [null] });
    expect(closedIfFull(REAL, 'mini', part)).toBe(part);
    expect(withdrawn(REAL, 'mini', part).played).toEqual([null, null]);
    const last = withdrawn(REAL, 'mini', season({ played: [null, null] }));
    expect(last).toEqual({ grade: 'club', begun: 1, played: [], titles: 0 });
    // a season already full is closed first, and the withdrawal is from the one that follows
    expect(withdrawn(REAL, 'mini', season({ played: [null, null, null] }))).toEqual({
      grade: 'club',
      begun: 1,
      played: [null],
      titles: 0,
    });
  });
});

describe('an event finished', () => {
  it('places the player, pays their share of the pot, and moves the season on by a card', () => {
    const s = season();
    const done = finishEvent(REAL, 'mini', s, cardOf(meadow, 14));
    const fee = entryFee(REAL.tours.mini[0].purse);
    expect(done.place).toBe(1);
    expect(done.tied).toBe(false);
    expect(done.prize).toBe(Math.floor(0.5 * fee * FIELD_SIZE));
    expect(done.points).toBe(pointsFor(1));
    expect(done.season.played).toEqual([cardOf(meadow, 14)]);
    expect(done.seasonOver).toBe(false);
    expect(s.played, 'the season it was given is left as it was').toEqual([]);
    expect(finishEvent(REAL, 'mini', s, cardOf(meadow, 200)).prize).toBe(0);
  });

  it('closes the season at its last event, saying whether the player went up or won a title', () => {
    const before = season({ played: [null, null] });
    const done = finishEvent(REAL, 'mini', before, cardOf(meadow, 14));
    expect(done.seasonOver).toBe(true);
    expect(done.season.played).toEqual([]);
    expect(done.season.begun).toBe(1);
    expect([done.promotedTo, done.title]).toEqual([null, false]);
    // a single event of a single event season, won, with the table's rivals, goes up
    const up = finishEvent(ONE, 'mini', season(), cardOf(meadow, 14));
    expect(up.promotedTo).toBe('county');
    const top = finishEvent(ONE, 'mini', season({ grade: 'championship', titles: 1 }), cardOf(meadow, 14));
    expect([top.promotedTo, top.title, top.season.titles]).toEqual([null, true, 2]);
  });

  it('knows the grades in order', () => {
    expect(GRADES).toEqual(['club', 'county', 'championship']);
    expect(standings([], 0)).toEqual([]);
  });
});
