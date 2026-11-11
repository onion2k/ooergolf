/**
 * The ways out of a hole the game gives the menu: a hole picked up (scored at the limit, paid nothing, an event's card and kept
 * round right) and a hole restarted (from its tee, with the card and the retake as they were; refused in an event, and a
 * restarted hole in practice pays nothing when it is finished, or a restart would farm the gems of an ace).
 */
import { describe, expect, it } from 'vitest';
import { powerFor } from '../src/arena';
import { Game, LIMIT_OVER_PAR, type GameEvents } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { paid } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, GREEN, field, golfGame, settle } from './helpers';
import { NORTH, holeInOne, next } from './rounds';
import { SMALL, SMALL_A, SMALL_C, roundOfEvent } from './small-season';

/** A game on a small season at the county grade, with every event told. */
function played(save: Record<string, unknown> = {}) {
  const county = { grade: 'county', begun: 0, played: [], titles: 0 };
  const json = JSON.stringify({ coins: 1000, season: { golf: county, mini: county }, ...save });
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
  const game = new Game(new Progress(memoryStore(json)), events, {
    random: seeded(3),
    course: SMALL_A.holes,
    today: () => '2026-11-11',
    season: SMALL,
  });
  return { game, calls };
}
const told = (calls: [string, unknown[]][], name: string) => calls.filter(([n]) => n === name);
/** A stroke struck hard and let roll for a few frames: the ball is moving and the hole is in play. */
function rolling(game: Game) {
  game.shoot(NORTH + 0.4, powerFor(6, game.hardest));
  settle(game, 6);
  expect(game.phase).toBe('play');
  expect(game.ready).toBe(false);
}

describe('picking a hole up', () => {
  it('scores par plus five and pays nothing, with the ball rolling', () => {
    const { game, calls } = played();
    game.playCourse([GREEN, GREEN, GREEN]);
    const coins = game.progress.save.coins;
    rolling(game);
    expect(game.pickUp()).toBe(true);
    expect(game.phase).toBe('done');
    expect(game.card).toEqual([GREEN.par + LIMIT_OVER_PAR]);
    expect(game.progress.save.coins).toBe(coins);
    expect(game.progress.save.gems).toBe(0);
    expect(told(calls, 'pickedUp')).toEqual([['pickedUp', [GREEN.par + LIMIT_OVER_PAR, GREEN.par]]]);
    expect(told(calls, 'holed')).toEqual([]);
    expect(checkInvariants(game)).toEqual([]);
    next(game);
    expect(game.hole, 'the next hole follows').toBe(1);
  });

  it('takes the ball up, so that one in the air tells of no landing, long drive or lost ball on a hole that is done', () => {
    const { game, calls } = golfGame(field('f'));
    expect(game.layout.golf).toBe(true);
    game.shoot(NORTH, 1);
    settle(game, 10);
    expect(game.world.alive[game.ball], 'in the air').toBe(1);
    expect(game.pickUp()).toBe(true);
    expect(game.world.alive[game.ball], 'picked up').toBe(0);
    const told = calls.length;
    settle(game, 60 * 8);
    // nothing of the ball, only the round's end, which this one hole's course comes to
    expect(calls.slice(told).map(([name]) => name)).toEqual(['finished']);
    expect(game.card).toEqual([game.def.par + LIMIT_OVER_PAR]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('does the same with the ball at rest, and is refused once the hole is done or the round over', () => {
    const { game } = played();
    game.playCourse([GREEN]);
    expect(game.pickUp()).toBe(true);
    expect(game.card).toEqual([GREEN.par + LIMIT_OVER_PAR]);
    expect(game.pickUp(), 'between holes').toBe(false);
    expect(game.card.length).toBe(1);
    next(game);
    expect(game.phase).toBe('over');
    expect(game.pickUp(), 'after the round').toBe(false);
    expect(game.card.length).toBe(1);
  });

  it('keeps an event’s card and kept round right: the hole on the card at the limit, marked picked up, nothing paid', () => {
    const { game } = played();
    expect(game.enter('golf')).toBe(true);
    const coins = game.progress.save.coins;
    expect(game.pickUp()).toBe(true);
    const save = game.progress.save;
    expect(game.card).toEqual([GREEN.par + LIMIT_OVER_PAR]);
    expect(save.round).toMatchObject({ hole: 1, card: [GREEN.par + LIMIT_OVER_PAR], pickedUp: true });
    expect(save.coins).toBe(coins);
    expect(save.best, 'a hole not holed has no best').toEqual({});
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('restarting a hole', () => {
  it('is refused in an event, changing nothing', () => {
    const { game } = played();
    game.enter('golf');
    rolling(game);
    const strokes = game.strokes;
    expect(game.restartHole()).toBe(false);
    expect(game.strokes).toBe(strokes);
    expect(game.event).not.toBeNull();
  });

  it('is refused between holes', () => {
    const { game } = played();
    game.playCourse([GREEN, GREEN]);
    holeInOne(game);
    expect(game.phase).toBe('done');
    expect(game.restartHole()).toBe(false);
    expect(game.card.length).toBe(1);
  });

  it('puts the ball on the tee with no strokes, tells the hole begun, and leaves the card and the retake as they were', () => {
    const { game, calls } = played({ owned: ['watch'], kit: { accessory: 'watch' } });
    game.playCourse([GREEN, GREEN]);
    holeInOne(game);
    next(game);
    expect(game.hole).toBe(1);
    game.shoot(NORTH + 0.4, powerFor(3, game.hardest));
    expect(game.mulligan()).toBe(true);
    game.shoot(NORTH + 0.4, powerFor(6, game.hardest));
    settle(game, 6);
    const card = [...game.card];
    const begun = told(calls, 'started').length;
    expect(game.restartHole()).toBe(true);
    expect([game.hole, game.strokes, game.phase]).toEqual([1, 0, 'play']);
    expect(game.card).toEqual(card);
    expect(game.mulliganUsed, 'a retake used stays used').toBe(true);
    expect(game.world.x[game.ball]).toBeCloseTo(game.layout.tee.x, 5);
    expect(game.world.y[game.ball]).toBeCloseTo(game.layout.tee.y, 5);
    expect(told(calls, 'started').length).toBe(begun + 1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('in practice pays nothing for that hole when it is finished, and the next pays as ever', () => {
    const { game } = played({ coins: 0, mode: 'career' });
    game.practise(SMALL_C.holes, roundOfEvent(SMALL_C));
    rolling(game);
    expect(game.restartHole()).toBe(true);
    holeInOne(game);
    expect(game.progress.save.coins).toBe(0);
    expect(game.progress.save.gems, 'no gems for an ace taken twice').toBe(0);
    next(game);
    holeInOne(game);
    expect(game.progress.save.coins).toBe(paid(1, GREEN.par, false, game.kit.underParPay).coins);
    expect(game.progress.save.gems).toBe(1);
  });

  it('in a round that pays, an ace after a restart pays nothing', () => {
    const { game } = played({ coins: 0, mode: 'career' });
    game.playCourse([GREEN]);
    expect(game.restartHole()).toBe(true);
    holeInOne(game);
    expect(game.progress.save.coins).toBe(0);
    expect(game.progress.save.gems).toBe(0);
  });

  it('is allowed again by a stroke already taken, any number of times', () => {
    const { game } = played();
    game.startAt(0);
    for (let i = 0; i < 3; i++) {
      game.shoot(NORTH, powerFor(2, game.hardest));
      for (let f = 0; f < 60 * 3; f++) game.step(DT);
      expect(game.restartHole()).toBe(true);
      expect(game.strokes).toBe(0);
    }
  });
});
