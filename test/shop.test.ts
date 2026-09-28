/** What a hole pays, the clubs and what they cost, buying one, and carrying it: the save the shop is built on. */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, powerFor, rollsFor } from '../src/arena';
import { CLUBS, PAY, STARTING_CLUB, clubById, paid } from '../src/clubs';
import { COURSE } from '../src/course';
import { CLEAR_OF_CUP, LIMIT_OVER_PAR, type Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { DT, newGame } from './helpers';

/** The ball holed on the first hole in `strokes`: soft putts away from the cup, then one in. */
function holeIn(game: Game, strokes: number) {
  const { cup, tee } = game.layout;
  for (let s = 1; s < strokes; s++) {
    game.place(tee.x, tee.y);
    game.shoot(s % 2 ? 0 : Math.PI, 0.05);
    for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
  }
  game.place(cup.x, cup.y - CLEAR_OF_CUP - 0.1);
  game.shoot(Math.PI / 2, powerFor(8, game.hardest));
  for (let f = 0; f < 240 && game.phase === 'play'; f++) game.step(DT);
}

describe('the clubs', () => {
  it('start from the putter every player has, and each costs more and rolls further than the last, up to about 72', () => {
    expect(CLUBS[0].id).toBe(STARTING_CLUB);
    expect(CLUBS[0].hardest).toBe(HARDEST_SHOT);
    expect(CLUBS[0].coins).toBe(0);
    for (let k = 1; k < CLUBS.length; k++) {
      expect(CLUBS[k].hardest, CLUBS[k].name).toBeGreaterThan(CLUBS[k - 1].hardest);
      expect(CLUBS[k].coins, CLUBS[k].name).toBeGreaterThan(CLUBS[k - 1].coins);
    }
    // each as far as it rolled under the drag it was first chosen with: the finest half as far again as the putter
    expect(rollsFor(CLUBS[CLUBS.length - 1].hardest)).toBeGreaterThan(68);
    expect(rollsFor(CLUBS[CLUBS.length - 1].hardest)).toBeLessThan(76);
    expect(rollsFor(CLUBS[1].hardest), 'the first a little further than the putter').toBeGreaterThan(53);
    expect(rollsFor(CLUBS[1].hardest)).toBeLessThan(58);
    expect(new Set(CLUBS.map((c) => c.id)).size, 'every id its own').toBe(CLUBS.length);
    expect(clubById('nonsense')).toBe(CLUBS[0]);
  });
});

describe('what a hole pays', () => {
  it('pays for finishing, more for each stroke under par, a gem for a hole in one, and nothing for a pick-up', () => {
    expect(paid(3, 3, false)).toEqual({ coins: PAY.finish, gems: 0 });
    expect(paid(2, 3, false)).toEqual({ coins: PAY.finish + PAY.underPar, gems: 0 });
    expect(paid(1, 3, false)).toEqual({ coins: PAY.finish + 2 * PAY.underPar, gems: PAY.holeInOne });
    expect(paid(5, 3, false)).toEqual({ coins: PAY.finish, gems: 0 });
    expect(paid(8, 3, true)).toEqual({ coins: 0, gems: 0 });
  });

  it('is paid into the save when a hole is holed, told of, and the save written, with the best score and the club it was made with', () => {
    const { game, told, store } = newGame();
    holeIn(game, 2);
    const due = paid(2, COURSE[0].par, false);
    expect(game.progress.save.coins).toBe(due.coins);
    expect(told).toContain(`paid ${due.coins} ${due.gems}`);
    expect(game.progress.save.best[COURSE[0].name]).toEqual({ strokes: 2, club: STARTING_CLUB });
    expect(JSON.parse(store.json!)).toEqual(game.progress.save);
  });

  it('keeps the best score, not the last', () => {
    const { game } = newGame();
    holeIn(game, 1);
    game.newRound();
    holeIn(game, 3);
    expect(game.progress.save.best[COURSE[0].name].strokes).toBe(1);
    expect(game.progress.save.gems).toBe(1);
  });

  it('pays nothing for a hole picked up at the limit', () => {
    const { game } = newGame();
    for (let s = 1; s <= COURSE[0].par + LIMIT_OVER_PAR; s++) {
      game.place(game.layout.tee.x, game.layout.tee.y);
      game.shoot(s % 2 ? 0 : Math.PI, 0.05);
      for (let f = 0; f < 600 && game.phase === 'play' && !game.ready; f++) game.step(DT);
    }
    expect(game.phase).toBe('done');
    expect(game.progress.save.coins).toBe(0);
    expect(game.progress.save.best[COURSE[0].name]).toBeUndefined();
  });
});

describe('the shop', () => {
  const rich = () => newGame(1, JSON.stringify({ coins: 10_000, gems: 20 }));

  it('sells a club for its price, once, and only to a player who can pay', () => {
    const { game, told } = newGame(1, JSON.stringify({ coins: CLUBS[1].coins - 1 }));
    expect(game.buy(CLUBS[1].id), 'a coin short').toBe(false);
    game.progress.save.coins += 1;
    expect(game.buy(CLUBS[1].id)).toBe(true);
    expect(game.progress.save.coins).toBe(0);
    expect(game.progress.save.owned).toContain(CLUBS[1].id);
    expect(told).toContain(`bought ${CLUBS[1].coins} ${CLUBS[1].gems}`);
    expect(game.buy(CLUBS[1].id), 'not twice').toBe(false);
    expect(game.buy('nonsense')).toBe(false);
  });

  it('asks gems as well as coins for the best clubs', () => {
    const best = CLUBS[CLUBS.length - 1];
    expect(best.gems).toBeGreaterThan(0);
    const { game } = newGame(1, JSON.stringify({ coins: best.coins, gems: best.gems - 1 }));
    expect(game.buy(best.id)).toBe(false);
  });

  it('puts a club owned in hand, and the next shot is as hard as it strikes', () => {
    const { game } = rich();
    const club = CLUBS[2];
    expect(game.equip(club.id), 'not owned yet').toBe(false);
    game.buy(club.id);
    expect(game.equip(club.id)).toBe(true);
    expect(game.hardest).toBe(club.hardest);
    game.shoot(0, 1);
    expect(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball])).toBeCloseTo(club.hardest, 6);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('writes the save when a club is bought or put in hand, and a reload keeps both', () => {
    const { game, store } = rich();
    game.buy(CLUBS[1].id);
    const bought = new Progress(memoryStore(store.json)).save;
    expect(bought.owned, 'saved on buying alone').toContain(CLUBS[1].id);
    expect(bought.coins).toBe(10_000 - CLUBS[1].coins);
    game.equip(CLUBS[1].id);
    const again = new Progress(memoryStore(store.json)).save;
    expect(again.owned).toContain(CLUBS[1].id);
    expect(again.club).toBe(CLUBS[1].id);
  });
});
