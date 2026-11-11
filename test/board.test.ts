/**
 * The career's screens' arithmetic: a course's par, the top of a table and the player after it, the order of merit, each tour's
 * next event, how the field stands part way round, what an event came to and the career's words. Read from the real saves in
 * `test/saves` (a season in progress, and the biome tours') and the real season, since the figures are the player's.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  boardNow,
  careerWords,
  eventCards,
  meritPlace,
  parOf,
  resultsOf,
  topAndYou,
  type LastPlaced,
} from '../src/board';
import { COURSES } from '../src/course';
import { Progress, memoryStore } from '../src/progress';
import { PRIZE, YOU, standings } from '../src/season';
import { eventField, seasonMerit } from '../src/tournament';
import { seasonContext } from '../src/tours';

const season = seasonContext();
const save = (file: string) =>
  new Progress(memoryStore(readFileSync(new URL(`saves/${file}`, import.meta.url), 'utf8'))).save;
const named = (n: string) => COURSES.find((c) => c.name === n)!;

describe('parOf', () => {
  it('is a course’s par from the field table, and the par thru some holes when given them', () => {
    // the records in 08-season.json were written with these pars
    expect(parOf(season, 'The Links')).toBe(36);
    expect(parOf(season, 'The Meadow')).toBe(26);
    expect(parOf(season, 'The Fells')).toBe(named('The Fells').summary.par);
    // the holes thru are the first of the table, and asking for more than the course has gives all of it
    expect(parOf(season, 'The Fells', 0)).toBe(0);
    expect(parOf(season, 'The Fells', 1)).toBe(season.table['The Fells'][0].par);
    expect(parOf(season, 'The Fells', 1000)).toBe(parOf(season, 'The Fells'));
  });
});

describe('topAndYou', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
  it('is the first n rows when the player is among them or not in the table', () => {
    expect(topAndYou(rows, 3).map((r) => r.name)).toEqual(['A', 'B', 'C']);
    const within = [...rows.slice(0, 2), { name: YOU }, ...rows.slice(2)];
    expect(topAndYou(within, 3).map((r) => r.name)).toEqual(['A', 'B', YOU]);
  });
  it('puts the player after the top n when they are further down, once', () => {
    const down = [...rows, { name: YOU }];
    expect(topAndYou(down, 3).map((r) => r.name)).toEqual(['A', 'B', 'C', YOU]);
    expect(topAndYou(down, 6).map((r) => r.name)).toEqual(['A', 'B', 'C', 'D', 'E', YOU]);
  });
});

describe('meritPlace', () => {
  it('is the player’s place in the order of merit, and nought before any event is played', () => {
    const s = save('08-season.json');
    expect(meritPlace(season, 'golf', { grade: 'club', begun: 0, played: [], titles: 0 })).toBe(0);
    const mini = s.season.mini;
    const merit = seasonMerit(season, 'mini', mini);
    // the one event played is a whole card of the player's (2,3,2,...), so they are in the table
    expect(meritPlace(season, 'mini', mini)).toBe(merit.find((m) => m.name === YOU)!.place);
    expect(meritPlace(season, 'mini', mini)).toBeGreaterThan(0);
    // a withdrawn event (null) gives the player no points and no place
    expect(meritPlace(season, 'golf', { ...s.season.golf, played: [null] })).toBe(
      seasonMerit(season, 'golf', { ...s.season.golf, played: [null] }).find((m) => m.name === YOU)?.place ?? 0,
    );
  });
});

describe('eventCards', () => {
  it('is none in free play', () => {
    expect(eventCards(season, { ...save('08-season.json'), mode: 'free' })).toBeNull();
  });
  it('is each tour’s next event for a season under way, with the round kept on its own tour', () => {
    const s = save('08-season.json');
    const cards = eventCards(season, s)!;
    const golf = cards.golf!;
    // two events of the golf tour are played (one withdrawn), so the third is next: The Fells, as the save’s round says
    expect([golf.tour, golf.grade, golf.event, golf.course, golf.coins]).toEqual([
      'golf',
      'county',
      3,
      'The Fells',
      410,
    ]);
    expect(golf.par).toBe(parOf(season, 'The Fells'));
    expect(golf.kept).toBe(3);
    expect(golf.paid).toBe(PRIZE.shares.length);
    expect(golf.events).toBe(season.tours.golf.length);
    // a county event costs its stake, and the pot is a stake for each of the field
    expect(golf.fee).toBe(Math.round(PRIZE.entry * named('The Fells').purse));
    expect(golf.pot).toBeGreaterThan(golf.fee);
    // the mini tour is a championship season with one event played; its round is not the one kept
    expect([cards.mini!.grade, cards.mini!.event, cards.mini!.kept]).toEqual(['championship', 2, null]);
    // the order of merit shows the top four, and the player after them if further down
    expect(golf.merit.length).toBeGreaterThanOrEqual(4);
    expect(golf.merit.filter((m) => m.you)).toHaveLength(1);
    expect(golf.merit.slice(0, 4).map((m) => m.place)).toEqual(
      [...golf.merit.slice(0, 4).map((m) => m.place)].sort((a, b) => a - b),
    );
  });
  it('has a card for every tour, the biome tours’ round kept on its own', () => {
    const cards = eventCards(season, save('12-biomes.json'))!;
    expect(Object.keys(cards).sort()).toEqual(['desert', 'future', 'golf', 'mini', 'moon']);
    expect(cards.desert!.kept).toBe(4);
    expect([cards.golf!.kept, cards.moon!.kept, cards.future!.kept]).toEqual([null, null, null]);
    expect([cards.desert!.grade, cards.desert!.event, cards.moon!.grade, cards.future!.grade]).toEqual([
      'county',
      2,
      'championship',
      'club',
    ]);
    // the club grade pays no fee to enter
    expect(cards.future!.fee).toBe(0);
    expect(cards.future!.event).toBe(1);
  });
});

describe('boardNow', () => {
  const s = save('08-season.json');
  const eventSeason = s.season.golf;
  it('is none away from an event, or before the event’s season is known', () => {
    expect(boardNow(season, null, [], eventSeason)).toBeNull();
    expect(boardNow(season, { tour: 'golf', index: 2 }, [5, 4], null)).toBeNull();
  });
  it('is the top three and the player thru the holes done, with the cut and how many are behind', () => {
    const card = [5, 4];
    const board = boardNow(season, { tour: 'golf', index: 2 }, card, eventSeason)!;
    const placed = standings(eventField(season, 'golf', eventSeason, 2, card), 2);
    const par = parOf(season, 'The Fells', 2);
    expect(board.thru).toBe(2);
    expect(board.rows.filter((r) => r.you)).toHaveLength(1);
    expect(board.rows.map((r) => r.name).slice(0, 3)).toEqual(placed.slice(0, 3).map((p) => p.name));
    const you = placed.find((p) => p.name === YOU)!;
    expect(board.rows.find((r) => r.you)).toEqual({
      place: you.place,
      tied: you.tied,
      name: YOU,
      toPar: you.total - par,
      you: true,
    });
    // 5 and 4 against the first two holes' pars
    expect(you.total).toBe(9);
    expect(board.cut).toBe(placed[PRIZE.shares.length - 1].total - par);
    expect(board.behind).toBe(placed.filter((p) => p.total > 9).length);
  });
});

describe('resultsOf', () => {
  const s = save('08-season.json');
  const before = s.season.golf;
  const card = [5, 4, 4, 4, 4, 3, 5, 4, 4];
  const lastPlaced: LastPlaced = {
    result: {
      place: 3,
      tied: true,
      prize: 125,
      points: 15,
      record: false,
      seasonOver: false,
      promotedTo: null,
      title: false,
    },
    tour: 'golf',
    index: 2,
    card,
    before,
  };
  it('is none until an event has been placed', () => {
    expect(resultsOf(season, null, 'The Fells')).toBeNull();
  });
  it('is the card at the end: the sticker from the placement, the field’s top four and the merit before and after', () => {
    const r = resultsOf(season, lastPlaced, 'The Fells')!;
    expect([r.course, r.place, r.tied, r.prize, r.seasonOver, r.promotedTo, r.title]).toEqual([
      'The Fells',
      3,
      true,
      125,
      false,
      null,
      false,
    ]);
    const field = eventField(season, 'golf', before, 2, card);
    expect(r.rows.slice(0, 4).map((x) => x.name)).toEqual(field.slice(0, 4).map((p) => p.name));
    expect(r.rows.filter((x) => x.you).map((x) => x.total)).toEqual([card.reduce((a, b) => a + b, 0)]);
    expect(r.meritFrom).toBe(meritPlace(season, 'golf', before));
    expect(r.meritTo).toBe(meritPlace(season, 'golf', { ...before, played: [...before.played, card] }));
  });
});

describe('careerWords', () => {
  it('is the mode, each course’s record as words and the hole the kept round goes on from', () => {
    expect(careerWords(save('08-season.json'))).toEqual({
      mode: 'career',
      records: { 'The Links': 'Record 33', 'The Meadow': 'Record 19' },
      round: { course: 'The Fells', hole: 3 },
    });
  });
  it('has no round when none is kept, and no records for a save without any', () => {
    const words = careerWords({ ...save('12-biomes.json'), round: null });
    expect(words).toEqual({ mode: 'career', records: {}, round: null });
  });
});
