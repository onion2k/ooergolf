/**
 * The career: a round of a named course pays a prize as its last hole is done, its best is the course's record, and the
 * round under way is kept so a reload goes on with it; free play pays nothing and keeps nothing. Played on a course of
 * the test's own (three practice greens, each holed in one or picked up), named as a course is.
 */
import { describe, expect, it } from 'vitest';
import { powerFor } from '../src/arena';
import { PRIZE, dayOf, isRecord, prizeOf, recordText, type RoundOf } from '../src/career';
import { COURSES, type HoleDef } from '../src/course';
import { CLEAR_OF_CUP, Game, type GameEvents } from '../src/game';
import { careerProblems, checkInvariants } from '../src/invariants';
import { PAY, paid } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, GREEN } from './helpers';

const NORTH = Math.PI / 2;
const HOLES: HoleDef[] = ['One', 'Two', 'Three'].map((n) => ({ ...GREEN, name: `Career ${n}` }));
const OF: RoundOf = { name: 'The Practice', purse: 1.5 };
const PAR = HOLES.length * GREEN.par;

/** A game with its save in a store the test keeps, and every event told with all its arguments. */
function career(json: string | null = null, today = '2026-10-15') {
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
  const game = new Game(new Progress(store), events, { random: seeded(3), course: HOLES, today: () => today });
  return { game, store, calls };
}

/** The hole in play holed in one. */
function holeInOne(g: Game) {
  const { cup } = g.layout;
  g.place(cup.x, cup.y - CLEAR_OF_CUP - 0.1);
  g.shoot(NORTH, powerFor(8, g.hardest));
  for (let f = 0; f < 60 * 12 && g.phase === 'play'; f++) g.step(DT);
  expect(g.phase).not.toBe('play');
}

/** The hole in play picked up: tapped about at the tee until the limit is reached. */
function pickUp(g: Game) {
  for (let s = 0; s < 20 && g.phase === 'play'; s++) {
    g.place(g.layout.tee.x, g.layout.tee.y);
    g.shoot(s % 2 ? 0 : Math.PI, 0.05);
    for (let f = 0; f < 60 * 40 && !(f > 2 && g.ready) && playing(g); f++) g.step(DT);
  }
  expect(g.phase).not.toBe('play');
}

/** Whether a hole is in play, read afresh: a stroke may end it. */
const playing = (g: Game) => g.phase === 'play';

/** The game moved on to the next hole, or to the end of the round. */
function next(g: Game) {
  for (let f = 0; f < 60 * 3 && g.phase === 'done'; f++) g.step(DT);
}

describe('the prize', () => {
  it('pays the base times the purse, for each stroke under par, and for a record', () => {
    expect(prizeOf(30, 36, 1.2, false)).toBe(Math.round(PRIZE.base * 1.2) + 6 * PRIZE.underPar);
    expect(prizeOf(40, 36, 2, true)).toBe(PRIZE.base * 2 + PRIZE.record);
    expect(prizeOf(36, 36, 1, false)).toBe(PRIZE.base);
  });

  it('is a record only for a round with every hole holed, and better than the one held', () => {
    const held = { strokes: 30, par: 36, kit: { club: '', ball: '', accessory: '' }, when: '' };
    expect(isRecord(40, false, undefined)).toBe(true);
    expect(isRecord(29, false, held)).toBe(true);
    expect(isRecord(30, false, held)).toBe(false);
    expect(isRecord(20, true, undefined)).toBe(false);
  });

  it('says a record as a card has room for, and a day as the record keeps it', () => {
    expect(recordText(undefined)).toBe('');
    expect(recordText({ strokes: 31, par: 36, kit: { club: '', ball: '', accessory: '' }, when: '' })).toBe(
      'Record 31',
    );
    expect(dayOf(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('has a purse on every course, one for minigolf and more for golf, rising to The Old Course', () => {
    for (const c of COURSES) expect(c.purse, c.name).toBe(c.golf ? c.purse : 1);
    const golf = COURSES.filter((c) => c.golf).map((c) => c.purse);
    expect(golf.every((p) => p > 1 && p <= 2)).toBe(true);
    expect(COURSES.find((c) => c.name === 'The Old Course')!.purse).toBe(Math.max(...golf));
  });
});

describe('a career round', () => {
  it('pays its prize at the last hole, keeps its record with the kit and the day, and says so once', () => {
    const { game, calls } = career();
    game.playCourse(HOLES, OF);
    const coins = game.progress.save.coins;
    for (let h = 0; h < HOLES.length; h++) {
      holeInOne(game);
      next(game);
    }
    expect(game.phase).toBe('over');
    const prize = prizeOf(3, PAR, OF.purse, true);
    const told = calls.filter(([n]) => n === 'roundPaid');
    expect(told).toEqual([['roundPaid', [prize, true]]]);
    // the holes paid as ever, and the round on top of them
    expect(game.progress.save.coins - coins).toBe(3 * paid(1, GREEN.par, false).coins + prize);
    expect(game.progress.save.records[OF.name]).toEqual({
      strokes: 3,
      par: PAR,
      kit: { club: '', ball: '', accessory: '' },
      when: '2026-10-15',
    });
    // told after the last hole's pay, and before the round is over
    const order = calls.map(([n]) => n).filter((n) => ['paid', 'roundPaid', 'finished'].includes(n));
    expect(order.slice(-3)).toEqual(['paid', 'roundPaid', 'finished']);
    expect(game.progress.save.round).toBeNull();
    expect(checkInvariants(game)).toEqual([]);
  });

  it('keeps the record when a round does no better, and pays no record bonus for it', () => {
    const { game, calls } = career();
    game.playCourse(HOLES, OF);
    for (let h = 0; h < HOLES.length; h++) {
      holeInOne(game);
      next(game);
    }
    game.newRound();
    holeInOne(game);
    next(game);
    pickUp(game);
    next(game);
    holeInOne(game);
    next(game);
    const told = calls.filter(([n]) => n === 'roundPaid');
    expect(told.length).toBe(2);
    expect(told[1][1]).toEqual([prizeOf(game.total, PAR, OF.purse, false), false]);
    expect(game.progress.save.records[OF.name].strokes).toBe(3);
  });

  it('sets no record with a hole picked up, though it is the first round finished', () => {
    const { game, calls } = career();
    game.playCourse(HOLES, OF);
    pickUp(game);
    next(game);
    holeInOne(game);
    next(game);
    holeInOne(game);
    next(game);
    expect(calls.filter(([n]) => n === 'roundPaid')).toEqual([
      ['roundPaid', [prizeOf(game.total, PAR, 1.5, false), false]],
    ]);
    expect(game.progress.save.records[OF.name]).toBeUndefined();
  });

  it('keeps the round under way after each hole, and gives it up for a new round', () => {
    const { game, store } = career();
    game.playCourse(HOLES, OF);
    holeInOne(game);
    expect(game.progress.save.round).toEqual({ course: OF.name, hole: 1, card: [1], retaken: false, pickedUp: false });
    expect(new Progress(memoryStore(store.json)).save.round, 'written to the store').toEqual(game.progress.save.round);
    next(game);
    game.newRound();
    expect(game.progress.save.round).toBeNull();
    expect(new Progress(memoryStore(store.json)).save.round).toBeNull();
  });

  it('goes on after a reload from the hole after the last finished, with its card, and pays as one round', () => {
    const first = career();
    first.game.playCourse(HOLES, OF);
    holeInOne(first.game);
    next(first.game);
    pickUp(first.game);
    // a reload, here between holes
    const { game, calls } = career(first.store.json);
    expect(game.resume(HOLES, OF)).toBe(true);
    expect(game.hole).toBe(2);
    expect(game.card).toEqual(first.game.card);
    expect(game.strokes).toBe(0);
    holeInOne(game);
    next(game);
    expect(game.phase).toBe('over');
    // the hole picked up before the reload still keeps it from being a record
    expect(calls.filter(([n]) => n === 'roundPaid')).toEqual([
      ['roundPaid', [prizeOf(game.total, PAR, 1.5, false), false]],
    ]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('refuses to go on with a round of another course, or with no hole left, and lets it go', () => {
    const { game, store } = career(
      JSON.stringify({ round: { course: OF.name, hole: 3, card: [1, 1, 1], retaken: false, pickedUp: false } }),
    );
    expect(game.progress.save.round).not.toBeNull();
    expect(game.resume(HOLES, OF), 'no hole left to play').toBe(false);
    expect(game.progress.save.round).toBeNull();
    expect(new Progress(memoryStore(store.json)).save.round).toBeNull();
    const other = career(JSON.stringify({ round: { course: 'Elsewhere', hole: 1, card: [2], retaken: false } }));
    expect(other.game.resume(HOLES, OF)).toBe(false);
    expect(other.game.progress.save.round).toBeNull();
  });

  it('keeps nothing for holes that are no course’s, and pays their holes as ever', () => {
    const { game, calls } = career();
    game.playCourse(HOLES);
    for (let h = 0; h < HOLES.length; h++) {
      holeInOne(game);
      expect(game.progress.save.round).toBeNull();
      next(game);
    }
    expect(calls.filter(([n]) => n === 'roundPaid')).toEqual([]);
    expect(game.progress.save.records).toEqual({});
    expect(game.progress.save.coins).toBe(3 * (PAY.finish + 2 * PAY.underPar));
  });
});

describe('free play', () => {
  it('pays nothing, keeps no best, record or round, and uses up no piggy bank', () => {
    const { game, calls } = career(
      JSON.stringify({ mode: 'free', coins: 500, owned: ['piggy'], kit: { accessory: 'piggy' } }),
    );
    expect(game.progress.save.mode).toBe('free');
    game.playCourse(HOLES, OF);
    for (let h = 0; h < HOLES.length; h++) {
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
    expect(calls.filter(([n]) => n === 'roundPaid' || n === 'paid' || n === 'spent')).toEqual([]);
  });

  it('leaves the career round kept as it was, and does not go on with it', () => {
    const json = JSON.stringify({
      mode: 'free',
      round: { course: OF.name, hole: 1, card: [2], retaken: false, pickedUp: false },
    });
    const { game } = career(json);
    expect(game.resume(HOLES, OF)).toBe(false);
    game.playCourse(HOLES, OF);
    holeInOne(game);
    next(game);
    expect(game.progress.save.round).toEqual({ course: OF.name, hole: 1, card: [2], retaken: false, pickedUp: false });
  });
});

describe('the rule of the career', () => {
  it('holds the round kept to the card, and a record to the holes’ bests', () => {
    const { game } = career();
    game.playCourse(HOLES, OF);
    holeInOne(game);
    expect(careerProblems(game)).toEqual([]);
    game.progress.save.round!.card[0] = 2;
    expect(careerProblems(game).join()).toMatch(/the round kept is 2 to hole 2, and the card is 1/);
    game.progress.save.round = null;
    expect(careerProblems(game).join()).toMatch(/no round is kept, with 1 of 3 holes/);
    game.progress.save.round = { course: 'Elsewhere', hole: 1, card: [1], retaken: false, pickedUp: false };
    expect(careerProblems(game).join()).toMatch(/the round kept is of Elsewhere/);
    game.progress.save.round = { course: OF.name, hole: 1, card: [1], retaken: false, pickedUp: false };
    for (const h of HOLES) game.progress.save.best[h.name] = { strokes: 2, kit: { club: '', ball: '', accessory: '' } };
    game.progress.save.records[OF.name] = {
      strokes: 5,
      par: PAR,
      kit: { club: '', ball: '', accessory: '' },
      when: '',
    };
    expect(careerProblems(game).join()).toMatch(/record of 5 beats its holes' bests, 6/);
    // a mode there is not, whatever is played
    (game.progress.save as { mode: string }).mode = 'ranked';
    expect(careerProblems(game).join()).toMatch(/the mode is ranked/);
  });

  it('asks nothing of a round in free play, or of holes that are no course’s', () => {
    const { game } = career();
    game.playCourse(HOLES);
    holeInOne(game);
    game.progress.save.round = { course: 'Elsewhere', hole: 1, card: [4], retaken: false, pickedUp: false };
    expect(careerProblems(game)).toEqual([]);
    game.playCourse(HOLES, OF);
    game.setMode('free');
    expect(game.of, 'the round is no course’s once the mode changes').toBeNull();
    expect(careerProblems(game)).toEqual([]);
  });

  it('names an untouched first tee as a course’s, and refuses once a stroke is taken', () => {
    const { game } = career(
      JSON.stringify({ round: { course: 'Elsewhere', hole: 1, card: [4], retaken: false, pickedUp: false } }),
    );
    expect(game.adopt(OF)).toBe(true);
    expect(game.of).toEqual(OF);
    expect(game.progress.save.round, 'the round kept is given up for a new one').toBeNull();
    game.shoot(NORTH, 0.1);
    expect(game.adopt(OF)).toBe(false);
  });
});

describe('a round begun part way round by a test', () => {
  it('is no career round: no prize, no record, no round kept', () => {
    const { game, calls } = career();
    game.playCourse(HOLES, OF);
    game.startAt(2);
    expect(game.of).toBeNull();
    holeInOne(game);
    next(game);
    expect(game.phase).toBe('over');
    expect(calls.filter(([n]) => n === 'roundPaid')).toEqual([]);
    expect(game.progress.save.records).toEqual({});
    expect(checkInvariants(game)).toEqual([]);
  });
});
