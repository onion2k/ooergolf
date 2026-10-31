/**
 * The tours of the three biomes: the desert, the moon and the future each have a tour of their three courses, a season of
 * three events at the club grade, a fee a grade up, and a round kept that a reload goes on with, as the golf and mini tours
 * have. The courses are the real ones, in the order the start screen shows them; the seasons are played on small greens of the
 * test's own (see `season-context.ts`), so a whole season is a few seconds, with one tour's events entered and won at a time.
 */
import { describe, expect, it } from 'vitest';
import { freshTourSeason } from '../src/career';
import { COURSES } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { careerProblems, checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GRADES, TOURS, entryFee, seasonSeed, stakeOf } from '../src/season';
import { eventsIn } from '../src/tournament';
import { seasonContext } from '../src/tours';
import { GREEN } from './helpers';
import { holeInOne, next, pickUp } from './rounds';
import { contextOf } from './season-context';
import { SMALL_A, SMALL_B, SMALL_C, roundOfEvent } from './small-season';
import type { HoleDef } from '../src/course';
import type { EventCourse } from '../src/tournament';

const BIOME_TOURS = ['desert', 'moon', 'future'] as const;
const green = (course: string, n: string): HoleDef => ({ ...GREEN, name: `${course} ${n}` });
/** An event of three practice greens, holed in one or picked up. */
const small = (name: string, purse: number): EventCourse => ({
  name,
  purse,
  holes: ['One', 'Two', 'Three'].map((n) => green(name, n)),
});
/** Three events a biome tour, at the purses the real courses of a biome have, easiest first. */
const EVENTS: Record<(typeof BIOME_TOURS)[number], EventCourse[]> = {
  desert: [small('Dune A', 1.2), small('Dune B', 1.5), small('Dune C', 1.9)],
  moon: [small('Crater A', 1.2), small('Crater B', 1.5), small('Crater C', 1.9)],
  future: [small('Neon A', 1.2), small('Neon B', 1.5), small('Neon C', 1.9)],
};
const SEASON = contextOf({ golf: [SMALL_A, SMALL_B], mini: [SMALL_C], ...EVENTS });

/** A game with its save in a store the test keeps, and every event told with all its arguments. */
function career(json: string | null = JSON.stringify({ coins: 500 })) {
  const store = memoryStore(json);
  const calls: [string, unknown[]][] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) =>
          calls.push([name, args]),
    },
  );
  const game = new Game(new Progress(store), events, {
    random: seeded(3),
    course: SMALL_C.holes,
    today: () => '2026-10-31',
    season: SEASON,
  });
  return { game, store, calls };
}
const told = (calls: [string, unknown[]][], ...names: string[]) => calls.filter(([n]) => names.includes(n));

describe('the real courses and tours of the biomes', () => {
  it('stand after the first nine, each biome’s three easiest first, with a biome on each and on no other', () => {
    expect(COURSES.slice(0, 9).map((c) => c.name)).toEqual([
      'The Meadow',
      'The Pinball Shed',
      'The Waterworks',
      'The Links',
      'The Heath',
      'The Fells',
      'The Woods',
      'The Isles',
      'The Old Course',
    ]);
    expect(COURSES.slice(9).map((c) => [c.name, c.biome, c.purse, c.golf])).toEqual([
      ['The Saltpan', 'desert', 1.2, true],
      ['The Mesa', 'desert', 1.5, true],
      ['The Badlands', 'desert', 1.9, true],
      ['Tranquility', 'moon', 1.2, true],
      ['Copernicus', 'moon', 1.5, true],
      ['The Far Side', 'moon', 1.9, true],
      ['Neon Park', 'future', 1.2, true],
      ['Chrome Heights', 'future', 1.5, true],
      ['The Singularity', 'future', 1.9, true],
    ]);
    expect(COURSES.slice(0, 9).every((c) => c.biome === undefined)).toBe(true);
  });

  it('have a tour a biome of three events, its own courses, and leave the golf tour at six', () => {
    const real = seasonContext();
    expect(TOURS).toEqual(['golf', 'mini', 'desert', 'moon', 'future']);
    expect(eventsIn(real, 'golf')).toBe(6);
    expect(eventsIn(real, 'mini')).toBe(3);
    for (const tour of BIOME_TOURS) {
      expect(eventsIn(real, tour), tour).toBe(3);
      expect(
        real.tours[tour].map((c) => c.name),
        tour,
      ).toEqual(COURSES.filter((c) => c.biome === tour).map((c) => c.name));
      for (const course of real.tours[tour]) expect(real.table[course.name], course.name).toHaveLength(9);
    }
  });

  it('give each tour a seed of its own, so no two seasons draw the same field', () => {
    const seeds = TOURS.map((tour) => seasonSeed(0, tour, 'club'));
    expect(new Set(seeds).size).toBe(TOURS.length);
  });
});

for (const tour of BIOME_TOURS) {
  describe(`the ${tour} tour`, () => {
    const events = EVENTS[tour];
    const save = (g: Game) => g.progress.save;

    it('plays a season end to end: three events entered free at the club grade, won, and the grade up at the end', () => {
      const { game, calls } = career();
      for (let e = 0; e < 3; e++) {
        expect(game.enter(tour), `event ${e + 1}`).toBe(true);
        expect(game.event).toEqual({ tour, index: e });
        expect(game.of?.name).toBe(events[e].name);
        for (let h = 0; h < 3; h++) {
          holeInOne(game);
          next(game);
        }
        expect(game.phase).toBe('over');
        expect(checkInvariants(game), `after event ${e + 1}`).toEqual([]);
      }
      const placed = told(calls, 'placed').map(([, a]) => (a[0] as { place: number }).place);
      expect(placed, 'a hole in one a hole wins every event').toEqual([1, 1, 1]);
      // the club grade is free, and the season is closed once its third event is played: the winner goes up
      expect(save(game).season[tour]).toEqual({ grade: 'county', begun: 1, played: [], titles: 0 });
      for (const other of TOURS.filter((t) => t !== tour))
        expect(save(game).season[other], `${other} is untouched`).toEqual(freshTourSeason());
      expect(save(game).round).toBeNull();
      expect(careerProblems(game)).toEqual([]);
    });

    it('takes a fee a grade up, and refuses one the coins do not cover with everything where it was', () => {
      const county = { grade: 'county', begun: 1, played: [], titles: 0 };
      const fee = entryFee(events[0].purse, 'county');
      expect(fee).toBe(stakeOf(events[0].purse));
      const poor = career(JSON.stringify({ coins: fee - 1, season: { [tour]: county } }));
      const before = poor.store.json;
      expect(poor.game.enter(tour)).toBe(false);
      expect(poor.game.progress.save.coins).toBe(fee - 1);
      expect(poor.game.progress.save.round).toBeNull();
      expect(poor.game.event).toBeNull();
      expect(poor.store.json, 'nothing was written').toBe(before);
      expect(told(poor.calls, 'entered')).toEqual([]);
      const rich = career(JSON.stringify({ coins: fee, season: { [tour]: county } }));
      expect(rich.game.enter(tour)).toBe(true);
      expect(rich.game.progress.save.coins).toBe(0);
      expect(told(rich.calls, 'entered')).toEqual([['entered', [fee]]]);
    });

    it('keeps the round from entry, and a reload mid-event goes on with it on the same tour, and pays one round', () => {
      const first = career();
      expect(first.game.enter(tour)).toBe(true);
      holeInOne(first.game);
      next(first.game);
      pickUp(first.game);
      expect(save(first.game).round).toMatchObject({ tour, course: events[0].name, hole: 2 });
      // a reload, here between holes
      const { game, calls } = career(first.store.json);
      expect(save(game).round).toMatchObject({ tour, course: events[0].name, hole: 2 });
      expect(game.resume(events[0].holes, roundOfEvent(events[0]))).toBe(true);
      expect(game.event).toEqual({ tour, index: 0 });
      expect(game.hole).toBe(2);
      expect(game.card).toEqual(first.game.card);
      holeInOne(game);
      next(game);
      expect(game.phase).toBe('over');
      expect(told(calls, 'roundPaid')).toHaveLength(1);
      expect(save(game).season[tour].played).toHaveLength(1);
      expect(checkInvariants(game)).toEqual([]);
    });

    it('refuses to go on with a round kept on this tour at the course of another tour’s event', () => {
      const first = career();
      first.game.enter(tour);
      holeInOne(first.game);
      next(first.game);
      const { game } = career(first.store.json);
      expect(game.resume(SMALL_A.holes, roundOfEvent(SMALL_A))).toBe(false);
      expect(save(game).round, 'let go').toBeNull();
    });

    it('gives up the round kept on another tour when this tour’s event is entered, as one tour always has for another', () => {
      const first = career();
      first.game.enter('golf');
      const { game } = career(first.store.json);
      expect(game.enter(tour)).toBe(true);
      expect(save(game).round).toMatchObject({ tour, hole: 0 });
      expect(save(game).season.golf.played, 'the golf event was withdrawn from').toEqual([null]);
    });
  });
}

describe('the grades', () => {
  it('are as they were, so a season in an old save goes up as it did', () => {
    expect(GRADES).toEqual(['club', 'county', 'championship']);
  });
});
