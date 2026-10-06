/** What a hole pays, which is the shop's purse and what holes are held to; the shop's items are in `items.test.ts`. */
import { describe, expect, it } from 'vitest';
import { powerFor } from '../src/arena';
import { PAY, paid } from '../src/items';
import { COURSE } from '../src/course';
import { CLEAR_OF_CUP, LIMIT_OVER_PAR, type Game } from '../src/game';
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

describe('what a hole pays', () => {
  it('pays for finishing, more for each stroke under par, a gem for a hole in one, and nothing for a pick-up', () => {
    expect(paid(3, 3, false)).toEqual({ coins: PAY.finish, gems: 0 });
    expect(paid(2, 3, false)).toEqual({ coins: PAY.finish + PAY.underPar, gems: 0 });
    expect(paid(1, 3, false)).toEqual({ coins: PAY.finish + 2 * PAY.underPar, gems: PAY.holeInOne });
    expect(paid(5, 3, false)).toEqual({ coins: PAY.finish, gems: 0 });
    expect(paid(8, 3, true)).toEqual({ coins: 0, gems: 0 });
  });

  it('is paid into the save when a hole is holed, told of, and the save written, with the best score and the item it was made with', () => {
    const { game, told, store } = newGame();
    holeIn(game, 2);
    const due = paid(2, COURSE[0].par, false);
    expect(game.progress.save.coins).toBe(due.coins);
    expect(told).toContain(`paid ${due.coins} ${due.gems}`);
    expect(game.progress.save.best[COURSE[0].name]).toEqual({ strokes: 2, item: '' });
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
