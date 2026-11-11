/**
 * The daily hole in the game: the first go of a day is the one kept and paid, taken at its first stroke (left unfinished it reads did
 * not finish), and every later go that day pays nothing, counts nothing and changes nothing. The slot the save keeps is one small
 * fixed record, and a run of days is counted from it. The hole is any hole here; the generator's own is `daily.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { powerFor } from '../src/arena';
import { shiftDay } from '../src/daily';
import { Game, LIMIT_OVER_PAR, type GameEvents } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { paid } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GREEN, settle } from './helpers';
import { NORTH, holeInOne, next, pickUp } from './rounds';
import { SMALL, roundOfEvent, SMALL_A } from './small-season';

const DAY = '2026-11-11';
const NONE = { day: '', strokes: 0, par: 0, streak: 0 };

/** A game over a store, its save from `json` (the career by default); each event is noted. */
function played(json: Record<string, unknown> = {}, store = memoryStore(JSON.stringify(json))) {
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
    course: [GREEN],
    today: () => DAY,
    season: SMALL,
  });
  return { game, store, calls };
}
const slot = (g: Game) => g.progress.save.daily;
/** A stroke taken at the tee and let roll away, which is the first stroke of a go. */
const firstStroke = (g: Game) => {
  g.shoot(NORTH + 0.4, powerFor(3, g.hardest));
  settle(g, 6);
};

describe('the slot', () => {
  it('is empty for a save that has none, and for one that is not what it should be', () => {
    expect(played().game.progress.save.daily).toEqual(NONE);
    for (const bad of [
      4,
      'x',
      null,
      [],
      { day: 'tomorrow', strokes: 3, par: 4, streak: 2 },
      { day: '2026-02-30', strokes: 3, par: 4, streak: 1 },
    ])
      expect(played({ daily: bad }).game.progress.save.daily, JSON.stringify(bad)).toEqual(NONE);
  });

  it('keeps what is a day and counts, and the default for each field that is not', () => {
    expect(played({ daily: { day: DAY, strokes: 3, par: 4, streak: 2 } }).game.progress.save.daily).toEqual({
      day: DAY,
      strokes: 3,
      par: 4,
      streak: 2,
    });
    expect(played({ daily: { day: DAY, strokes: 'three', par: 4, streak: 2.5 } }).game.progress.save.daily).toEqual({
      day: DAY,
      strokes: 0,
      par: 4,
      streak: 0,
    });
  });
});

describe('the first go of a day', () => {
  it('is taken at its first stroke and not before, and written then', () => {
    const { game, store } = played();
    expect(game.playDaily(GREEN, DAY)).toBe(true);
    expect(game.daily).toEqual({ day: DAY, pays: true });
    expect(slot(game)).toEqual(NONE);
    firstStroke(game);
    expect(slot(game)).toEqual({ day: DAY, strokes: 0, par: GREEN.par, streak: 0 });
    expect(new Progress(memoryStore(store.json)).save.daily).toEqual(slot(game));
  });

  it('left unfinished reads did not finish, and a second go that day is a later go', () => {
    const { game, store } = played();
    game.playDaily(GREEN, DAY);
    firstStroke(game);
    const again = played({}, memoryStore(store.json)).game;
    expect(again.progress.save.daily).toEqual({ day: DAY, strokes: 0, par: GREEN.par, streak: 0 });
    again.playDaily(GREEN, DAY);
    expect(again.daily).toEqual({ day: DAY, pays: false });
  });

  it('is not taken by a go put away before a stroke', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    game.playCourse([GREEN]);
    expect(slot(game)).toEqual(NONE);
    expect(game.daily).toBeNull();
  });

  it('pays as a hole does, counts into the life, and is kept in the slot with a day running', () => {
    const { game, store } = played({ coins: 0 });
    game.playDaily(GREEN, DAY);
    holeInOne(game);
    const save = game.progress.save;
    expect(save.coins).toBe(paid(1, GREEN.par, false, game.kit.underParPay).coins);
    expect(save.gems).toBe(1);
    expect(save.life).toMatchObject({ holes: 1, aces: 1, rounds: 0 });
    expect(slot(game)).toEqual({ day: DAY, strokes: 1, par: GREEN.par, streak: 1 });
    expect(save.best, 'a day’s name would grow the best for ever').toEqual({});
    expect(save.feats).toContain('ace');
    expect(new Progress(memoryStore(store.json)).save).toEqual(save);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('pays and counts in free play as well, since it is a thing of its own and not a round of a course', () => {
    const { game } = played({ mode: 'free' });
    game.playDaily(GREEN, DAY);
    holeInOne(game);
    const save = game.progress.save;
    expect(save.coins).toBeGreaterThan(0);
    expect(save.life.holes).toBe(1);
    expect(slot(game).streak).toBe(1);
    expect(save.mode).toBe('free');
  });

  it('tells its end as a round of one hole does, once the hole has been shown', () => {
    const { game, calls } = played();
    game.playDaily(GREEN, DAY);
    holeInOne(game);
    next(game);
    expect(game.phase).toBe('over');
    expect(calls.filter(([n]) => n === 'finished')).toEqual([['finished', [1, GREEN.par]]]);
  });

  it('is refused a restart, whatever the strokes taken', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    expect(game.restartHole(), 'at the tee').toBe(false);
    firstStroke(game);
    expect(game.restartHole(), 'with a stroke taken').toBe(false);
    expect(game.strokes).toBe(1);
  });

  it('says it may not be restarted exactly when a restart is refused, there and in every other round', () => {
    const { game } = played({ coins: 1000, season: { golf: { grade: 'county', begun: 0, played: [], titles: 0 } } });
    game.playDaily(GREEN, DAY);
    expect(game.restartable).toBe(false);
    holeInOne(game);
    expect(game.restartable, 'between holes').toBe(false);
    next(game);
    game.playDaily(GREEN, DAY);
    expect(game.restartable, 'a later go').toBe(true);
    expect(game.restartHole()).toBe(true);
    game.newRound();
    expect(game.restartable, 'free play of a course').toBe(true);
    game.enter('golf');
    expect(game.restartable, 'in an event').toBe(false);
    expect(game.restartHole()).toBe(false);
  });

  it('picked up from the menu is scored at the limit, taken, paid nothing, and a day all the same', () => {
    const { game } = played({ coins: 5 });
    game.playDaily(GREEN, DAY);
    firstStroke(game);
    expect(game.pickUp()).toBe(true);
    expect(slot(game)).toEqual({ day: DAY, strokes: GREEN.par + LIMIT_OVER_PAR, par: GREEN.par, streak: 1 });
    expect(game.progress.save.coins).toBe(5);
    expect(game.progress.save.life.holes, 'a hole picked up is not holed').toBe(0);
  });

  it('picked up at the tee takes the day too, though no stroke was struck', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    expect(game.pickUp()).toBe(true);
    expect(slot(game)).toEqual({ day: DAY, strokes: GREEN.par + LIMIT_OVER_PAR, par: GREEN.par, streak: 1 });
  });

  it('played out to the limit is picked up by the game and kept as that', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    pickUp(game);
    expect(slot(game).strokes).toBe(GREEN.par + LIMIT_OVER_PAR);
  });

  it('leaves an event round kept to go on with, as a practice round does', () => {
    const { game } = played({ coins: 1000, season: { golf: { grade: 'county', begun: 0, played: [], titles: 0 } } });
    expect(game.enter('golf')).toBe(true);
    const kept = structuredClone(game.progress.save.round);
    game.playDaily(GREEN, DAY);
    holeInOne(game);
    expect(game.progress.save.round).toEqual(kept);
    expect(game.event).toBeNull();
  });

  it('is refused for what is not a day, changing nothing', () => {
    const { game } = played();
    const hole = game.hole;
    expect(game.playDaily(GREEN, '2026-02-30')).toBe(false);
    expect(game.playDaily(GREEN, 'today')).toBe(false);
    expect(game.daily).toBeNull();
    expect(game.hole).toBe(hole);
  });
});

describe('a later go the same day', () => {
  /** A game that has finished its first go in an ace, with a note of the save then. */
  function finished() {
    const g = played({ coins: 0 });
    g.game.playDaily(GREEN, DAY);
    holeInOne(g.game);
    return { ...g, json: g.store.json };
  }

  it('pays nothing, counts nothing and changes nothing in the save, not a byte of it', () => {
    const { game, store, json } = finished();
    next(game);
    expect(game.playDaily(GREEN, DAY)).toBe(true);
    expect(game.daily).toEqual({ day: DAY, pays: false });
    holeInOne(game);
    expect(game.phase).not.toBe('play');
    expect(game.progress.save).toEqual(JSON.parse(json!));
    expect(store.json, 'nothing written').toBe(json);
  });

  it('may be restarted, and told as a hole done, with a better score or a worse', () => {
    const { game, calls } = finished();
    next(game);
    game.playDaily(GREEN, DAY);
    firstStroke(game);
    expect(game.restartHole()).toBe(true);
    pickUp(game);
    expect(calls.filter(([n]) => n === 'pickedUp').length).toBe(1);
    expect(slot(game).strokes, 'the first go is the one kept').toBe(1);
  });

  it('is a later go too when the first was left unfinished, which stays unfinished', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    firstStroke(game);
    game.playDaily(GREEN, DAY);
    holeInOne(game);
    expect(slot(game)).toEqual({ day: DAY, strokes: 0, par: GREEN.par, streak: 0 });
    expect(game.progress.save.life.holes).toBe(0);
  });
});

describe('a run of days', () => {
  const ace = (g: Game, day: string) => {
    g.playDaily(GREEN, day);
    holeInOne(g);
    next(g);
  };

  it('grows by one for each day finished in turn, and the year turns over it', () => {
    const { game } = played();
    for (const [k, day] of ['2026-12-30', '2026-12-31', '2027-01-01'].entries()) {
      ace(game, day);
      expect(slot(game).streak, day).toBe(k + 1);
    }
  });

  it('starts again at one after a day missed', () => {
    const { game } = played();
    ace(game, DAY);
    ace(game, shiftDay(DAY, 1));
    ace(game, shiftDay(DAY, 3));
    expect(slot(game)).toEqual({ day: shiftDay(DAY, 3), strokes: 1, par: GREEN.par, streak: 1 });
  });

  it('starts again at one after a day not finished, and a day went back to is no run', () => {
    const { game } = played();
    ace(game, DAY);
    game.playDaily(GREEN, shiftDay(DAY, 1));
    firstStroke(game);
    expect(slot(game).streak, 'a day not finished has no run').toBe(1);
    ace(game, shiftDay(DAY, 2));
    expect(slot(game).streak).toBe(1);
    // a clock set back: the slot is a later day's, the earlier day is a later go, and pays nothing and changes nothing
    const before = JSON.stringify(game.progress.save);
    ace(game, DAY);
    expect(game.daily).toEqual({ day: DAY, pays: false });
    expect(JSON.stringify(game.progress.save)).toBe(before);
  });

  it('earns the feat of seven running on the seventh day, and not on the sixth', () => {
    const { game } = played();
    for (let k = 0; k < 6; k++) ace(game, shiftDay(DAY, k));
    expect(game.progress.save.feats).not.toContain('dailySeven');
    ace(game, shiftDay(DAY, 6));
    expect(game.progress.save.feats).toContain('dailySeven');
  });
});

describe('what is left of the round', () => {
  it('is no course’s: a practice round or a course after it has no daily left in it', () => {
    const { game } = played();
    game.playDaily(GREEN, DAY);
    game.practise(SMALL_A.holes, roundOfEvent(SMALL_A));
    expect(game.daily).toBeNull();
    game.playDaily(GREEN, DAY);
    game.startAt(0);
    expect(game.daily).toBeNull();
    game.playDaily(GREEN, DAY);
    game.newRound();
    expect(game.daily).toBeNull();
  });
});
