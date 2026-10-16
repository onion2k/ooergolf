/**
 * The career: a round of an event pays its place in the field as its last hole is done, its best is the course's record, and
 * the round under way is kept so a reload goes on with it; free play and practice pay nothing and keep nothing, and a round
 * of a course that is no event counts for nothing but its holes. Played on a small season of the test's own (courses of three
 * practice greens, each holed in one or picked up), whose events are entered as a player enters them.
 */
import { describe, expect, it } from 'vitest';
import { dayOf, isRecord, recordText } from '../src/career';
import { COURSES } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { careerProblems, checkInvariants } from '../src/invariants';
import { PAY, paid } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PRIZE } from '../src/season';
import { GREEN } from './helpers';
import { holeInOne, next, pickUp } from './rounds';
import { SMALL, SMALL_A, SMALL_B, SMALL_C, SMALL_PAR, roundOfEvent } from './small-season';

const NOTHING = { club: '', ball: '', accessory: '' };
/** The events' holes' pay when each is holed in one. */
const HOLE_PAY = paid(1, GREEN.par, false).coins;

/** A game with its save in a store the test keeps, and every event told with all its arguments. */
function career(json: string | null = JSON.stringify({ coins: 500 }), today = '2026-10-15') {
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
    today: () => today,
    season: SMALL,
  });
  return { game, store, calls };
}

/** The told events of the given names, in the order told. */
const told = (calls: [string, unknown[]][], ...names: string[]) => calls.filter(([n]) => names.includes(n));

describe('the record and the purse', () => {
  it('is a record only for a round with every hole holed, and better than the one held', () => {
    const held = { strokes: 30, par: 36, kit: NOTHING, when: '' };
    expect(isRecord(40, false, undefined)).toBe(true);
    expect(isRecord(29, false, held)).toBe(true);
    expect(isRecord(30, false, held)).toBe(false);
    expect(isRecord(20, true, undefined)).toBe(false);
  });

  it('says a record as a card has room for, and a day as the record keeps it', () => {
    expect(recordText(undefined)).toBe('');
    expect(recordText({ strokes: 31, par: 36, kit: NOTHING, when: '' })).toBe('Record 31');
    expect(dayOf(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('has a purse on every course, one for minigolf and more for golf, rising to The Old Course', () => {
    for (const c of COURSES) expect(c.purse, c.name).toBe(c.golf ? c.purse : 1);
    const golf = COURSES.filter((c) => c.golf).map((c) => c.purse);
    expect(golf.every((p) => p > 1 && p <= 2)).toBe(true);
    expect(COURSES.find((c) => c.name === 'The Old Course')!.purse).toBe(Math.max(...golf));
  });
});

/** The mini tour's one event, entered and played with every hole holed in one; the game, its store and what it told. */
function wonMini(json?: string | null) {
  const c = career(json);
  expect(c.game.enter('mini')).toBe(true);
  for (let h = 0; h < SMALL_C.holes.length; h++) {
    holeInOne(c.game);
    next(c.game);
  }
  return c;
}

describe('an event round', () => {
  it('pays its place at the last hole, keeps its record with the kit and the day, and says so once', () => {
    const { game, calls } = career();
    expect(game.enter('mini')).toBe(true);
    const coins = game.progress.save.coins;
    for (let h = 0; h < SMALL_C.holes.length; h++) {
      holeInOne(game);
      next(game);
    }
    expect(game.phase).toBe('over');
    // a pot of twelve fees of 25 coins, half of it to the winner, and the record's bonus on top
    const prize = 150 + PRIZE.record;
    expect(told(calls, 'roundPaid')).toEqual([['roundPaid', [prize, true]]]);
    // the holes paid as ever, and the round on top of them
    expect(game.progress.save.coins - coins).toBe(3 * HOLE_PAY + prize);
    expect(game.progress.save.records[SMALL_C.name]).toEqual({
      strokes: 3,
      par: SMALL_PAR,
      kit: NOTHING,
      when: '2026-10-15',
    });
    // told after the last hole's pay, then the place, and before the round is over
    const order = calls.map(([n]) => n).filter((n) => ['paid', 'roundPaid', 'placed', 'finished'].includes(n));
    expect(order.slice(-4)).toEqual(['paid', 'roundPaid', 'placed', 'finished']);
    expect(game.progress.save.round).toBeNull();
    expect(checkInvariants(game)).toEqual([]);
  });

  it('keeps the record when a round does no better, and pays no record bonus for it', () => {
    const { game, calls } = wonMini();
    // the next season, a grade up: a round no better than 3 is the same record, and its win is the share of the pot alone
    expect(game.enter('mini')).toBe(true);
    for (let h = 0; h < 3; h++) {
      holeInOne(game);
      next(game);
    }
    const [first, second] = told(calls, 'roundPaid');
    expect(first[1]).toEqual([175, true]);
    expect(second[1]).toEqual([150, false]);
    expect(game.progress.save.records[SMALL_C.name].strokes).toBe(3);
  });

  it('sets no record with a hole picked up, and pays nothing for a place outside the top three', () => {
    // a county season, whose rivals score 9, 12 and 15 on the three holes
    const { game, calls } = career(
      JSON.stringify({ coins: 500, season: { mini: { grade: 'county', begun: 0, played: [], titles: 0 } } }),
    );
    game.enter('mini');
    pickUp(game);
    next(game);
    holeInOne(game);
    next(game);
    holeInOne(game);
    next(game);
    // 10 strokes against rivals of 9, 12 and 15: fifth, which is paid nothing
    expect(told(calls, 'roundPaid')).toEqual([['roundPaid', [0, false]]]);
    expect(game.progress.save.records[SMALL_C.name]).toBeUndefined();
    expect(told(calls, 'placed')[0][1][0]).toMatchObject({ place: 5, prize: 0, points: 10, record: false });
  });

  it('keeps the round under way from the moment it is entered and after each hole, and gives it up for a new round', () => {
    const { game, store } = career();
    game.enter('mini');
    const round = { tour: 'mini', course: SMALL_C.name, hole: 0, card: [], retaken: false, pickedUp: false };
    expect(game.progress.save.round).toEqual(round);
    holeInOne(game);
    expect(game.progress.save.round).toEqual({ ...round, hole: 1, card: [1] });
    expect(new Progress(memoryStore(store.json)).save.round, 'written to the store').toEqual(game.progress.save.round);
    next(game);
    game.newRound();
    expect(game.progress.save.round).toBeNull();
    expect(new Progress(memoryStore(store.json)).save.round).toBeNull();
  });

  it('goes on after a reload from the hole after the last finished, with its card, and pays as one round', () => {
    const first = career();
    first.game.enter('mini');
    holeInOne(first.game);
    next(first.game);
    pickUp(first.game);
    // a reload, here between holes
    const { game, calls } = career(first.store.json);
    expect(game.resume(SMALL_C.holes, roundOfEvent(SMALL_C))).toBe(true);
    expect(game.hole).toBe(2);
    expect(game.card).toEqual(first.game.card);
    expect(game.strokes).toBe(0);
    expect(game.event).toEqual({ tour: 'mini', index: 0 });
    holeInOne(game);
    next(game);
    expect(game.phase).toBe('over');
    // the hole picked up before the reload still keeps it from being a record
    expect(told(calls, 'roundPaid').map(([, a]) => a[1])).toEqual([false]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('refuses to go on with a round of another course, or with no hole left, or not the next event, and lets it go', () => {
    const round = (over: object) =>
      JSON.stringify({
        coins: 500,
        round: { tour: 'mini', course: SMALL_C.name, hole: 1, card: [1], retaken: false, pickedUp: false, ...over },
      });
    const refused = (json: string, holes = SMALL_C.holes, of = roundOfEvent(SMALL_C)) => {
      const c = career(json);
      expect(c.game.progress.save.round).not.toBeNull();
      expect(c.game.resume(holes, of)).toBe(false);
      expect(c.game.progress.save.round).toBeNull();
      expect(new Progress(memoryStore(c.store.json)).save.round, 'let go in the store').toBeNull();
    };
    refused(round({ hole: 3, card: [1, 1, 1] }));
    refused(round({ course: 'Elsewhere' }));
    // the golf tour's next event is its first, whatever course the round says
    refused(round({ tour: 'golf', course: 'Small Heath' }), SMALL_B.holes, roundOfEvent(SMALL_B));
    // and a tour whose season has no event left has none for a round to be
    refused(
      JSON.stringify({
        coins: 500,
        season: { mini: { grade: 'club', begun: 0, played: [null], titles: 0 } },
        round: { tour: 'mini', course: SMALL_C.name, hole: 1, card: [1], retaken: false, pickedUp: false },
      }),
    );
  });

  it('keeps nothing for holes that are no course’s, and pays their holes as ever', () => {
    const { game, calls } = career();
    game.playCourse(SMALL_C.holes);
    for (let h = 0; h < 3; h++) {
      holeInOne(game);
      expect(game.progress.save.round).toBeNull();
      next(game);
    }
    expect(told(calls, 'roundPaid', 'placed', 'entered')).toEqual([]);
    expect(game.progress.save.records).toEqual({});
    expect(game.progress.save.coins).toBe(500 + 3 * (PAY.finish + 2 * PAY.underPar));
  });

  it('counts a round of a course that is no event for nothing but its holes: no place, no record, no round kept', () => {
    const { game, calls } = career();
    game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    expect(game.counting).toBe(false);
    for (let h = 0; h < 3; h++) {
      holeInOne(game);
      expect(game.progress.save.round).toBeNull();
      next(game);
    }
    expect(game.phase).toBe('over');
    expect(told(calls, 'roundPaid', 'placed')).toEqual([]);
    expect(game.progress.save.records).toEqual({});
    expect(game.progress.save.coins).toBe(500 + 3 * HOLE_PAY);
    expect(game.progress.save.season.mini.played).toEqual([]);
  });
});

describe('free play', () => {
  it('pays nothing, keeps no best, record or round, and uses up no piggy bank', () => {
    const { game, calls } = career(
      JSON.stringify({ mode: 'free', coins: 500, owned: ['piggy'], kit: { accessory: 'piggy' } }),
    );
    expect(game.progress.save.mode).toBe('free');
    expect(game.enter('mini'), 'there is nothing at stake in free play, so no event to enter').toBe(false);
    game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    for (let h = 0; h < 3; h++) {
      holeInOne(game);
      expect(game.progress.save.round).toBeNull();
      next(game);
    }
    expect(game.phase).toBe('over');
    expect(game.progress.save.coins).toBe(500);
    expect(game.progress.save.gems).toBe(0);
    expect(game.progress.save.best).toEqual({});
    expect(game.progress.save.records).toEqual({});
    expect(game.progress.save.owned).toContain('piggy');
    expect(told(calls, 'roundPaid', 'paid', 'spent', 'placed', 'entered')).toEqual([]);
  });

  it('leaves the event round kept as it was, and does not go on with it', () => {
    const kept = { tour: 'mini', course: SMALL_C.name, hole: 1, card: [2], retaken: false, pickedUp: false };
    const { game } = career(JSON.stringify({ mode: 'free', round: kept }));
    expect(game.resume(SMALL_C.holes, roundOfEvent(SMALL_C))).toBe(false);
    game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    holeInOne(game);
    next(game);
    expect(game.progress.save.round).toEqual(kept);
    expect(game.progress.save.season.mini.played, 'and not a withdrawal').toEqual([]);
  });
});

describe('the rule of the career', () => {
  it('holds the round kept to the card, and a record to the holes’ bests', () => {
    const { game } = career();
    game.enter('mini');
    holeInOne(game);
    expect(careerProblems(game)).toEqual([]);
    const save = game.progress.save;
    save.round!.card[0] = 2;
    expect(careerProblems(game).join()).toMatch(/the round kept is 2 to hole 2, and the card is 1/);
    save.round = null;
    expect(careerProblems(game).join()).toMatch(/no round is kept, with 1 of 3 holes/);
    save.round = { tour: 'mini', course: 'Elsewhere', hole: 1, card: [1], retaken: false, pickedUp: false };
    expect(careerProblems(game).join()).toMatch(/the round kept is of Elsewhere/);
    save.round = { tour: 'mini', course: SMALL_C.name, hole: 1, card: [1], retaken: false, pickedUp: false };
    for (const h of SMALL_C.holes) save.best[h.name] = { strokes: 2, kit: NOTHING };
    save.records[SMALL_C.name] = { strokes: 5, par: SMALL_PAR, kit: NOTHING, when: '' };
    expect(careerProblems(game).join()).toMatch(/record of 5 beats its holes' bests, 6/);
    // a mode there is not, whatever is played
    (save as { mode: string }).mode = 'ranked';
    expect(careerProblems(game).join()).toMatch(/the mode is ranked/);
  });

  it('holds a round to its tour and to the season’s next event, and a season to its grade and its events', () => {
    const { game } = career();
    game.enter('golf');
    const save = game.progress.save;
    expect(careerProblems(game)).toEqual([]);
    save.round!.tour = 'mini';
    expect(careerProblems(game).join()).toMatch(/the round kept is on the mini tour, and the golf is played/);
    save.round!.tour = 'golf';
    save.round!.course = SMALL_A.name;
    game.event!.index = 1;
    expect(careerProblems(game).join()).toMatch(/the round is event 2 and the golf season is on event 1/);
    game.event!.index = 0;
    save.season.golf.played = [null];
    expect(careerProblems(game).join()).toMatch(
      /the round kept is of Small Links, and the golf season's next event is Small Heath/,
    );
    save.season.golf.played = [[1, 2]];
    expect(careerProblems(game).join()).toMatch(/event 1 was played to a card of 2 holes, not 3/);
    save.season.golf.played = [null, null];
    expect(careerProblems(game).join()).toMatch(/the golf season has played 2 of its 2 events and is not closed/);
    save.season.golf.played = [];
    (save.season.golf as { grade: string }).grade = 'junior';
    expect(careerProblems(game).join()).toMatch(/the golf tour is at the grade junior/);
    (save.season.golf as { grade: string }).grade = 'club';
    expect(careerProblems(game)).toEqual([]);
  });

  it('asks nothing of a round in free play, or of holes that are no course’s', () => {
    const { game } = career();
    game.playCourse(SMALL_C.holes);
    holeInOne(game);
    game.progress.save.round = {
      tour: 'mini',
      course: 'Elsewhere',
      hole: 1,
      card: [4],
      retaken: false,
      pickedUp: false,
    };
    expect(careerProblems(game)).toEqual([]);
    game.enter('mini');
    game.setMode('free');
    expect(game.of, 'the round is no course’s once the mode changes').toBeNull();
    expect(game.event).toBeNull();
    expect(careerProblems(game)).toEqual([]);
  });

  it('names an untouched first tee as a course’s, and refuses once a stroke is taken', () => {
    const kept = { tour: 'mini', course: 'Elsewhere', hole: 1, card: [4], retaken: false, pickedUp: false };
    const { game } = career(JSON.stringify({ coins: 500, round: kept }));
    expect(game.adopt(roundOfEvent(SMALL_C))).toBe(true);
    expect(game.of).toEqual(roundOfEvent(SMALL_C));
    expect(game.progress.save.round, 'the round kept is given up for a new one').toBeNull();
    game.shoot(Math.PI / 2, 0.1);
    expect(game.adopt(roundOfEvent(SMALL_C))).toBe(false);
  });
});

describe('a round begun part way round by a test', () => {
  it('is no event: no place, no record, no round kept', () => {
    const { game, calls } = career();
    game.enter('mini');
    game.startAt(2);
    expect(game.of).toBeNull();
    expect(game.event).toBeNull();
    holeInOne(game);
    next(game);
    expect(game.phase).toBe('over');
    expect(told(calls, 'roundPaid', 'placed')).toEqual([]);
    expect(game.progress.save.records).toEqual({});
    expect(checkInvariants(game)).toEqual([]);
  });
});
