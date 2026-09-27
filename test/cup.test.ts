/**
 * What the cup catches, measured. The physics now in the game has a cup that
 * takes nearly every ball whose middle crosses it, however fast: a ball that
 * runs over or lips out needs the rim of artshape-physics 0.4.0, and this
 * test is to be sharpened then, with the cup's width chosen from the table
 * that version gives. Until then: every putt through the middle or near it
 * drops, and a fast ball wide of the middle runs past.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT } from '../src/arena';
import { CUP } from '../src/course';
import { CLEAR_OF_CUP } from '../src/game';
import { DT, newGame } from './helpers';

/** Whether a ball struck at the cup at `speed` from just clear of it, `aside` off its middle, is holed. */
function holes(speed: number, aside = 0): boolean {
  const { game } = newGame();
  const { cup } = game.layout;
  game.place(cup.x + aside, cup.y - CLEAR_OF_CUP - 0.1);
  game.shoot(Math.PI / 2, speed / HARDEST_SHOT);
  for (let f = 0; f < 300 && game.phase === 'play'; f++) game.step(DT);
  return game.phase === 'done';
}

describe('the cup', () => {
  it('catches every putt through the middle and near it, from a gentle one to a firm one', () => {
    for (const aside of [0, CUP.radius * 0.4, CUP.radius * 0.8])
      for (let v = 4; v <= 20; v += 2) expect(holes(v, aside), `${v} a second, ${aside.toFixed(2)} aside`).toBe(true);
  });

  it('lets a fast ball wide of the middle run past', () => {
    for (let v = 30; v <= HARDEST_SHOT; v += 2) expect(holes(v, CUP.radius * 1.2), `${v} a second`).toBe(false);
  });

  it('refuses a ball put down where the cup would draw it in before it is played', () => {
    const { game } = newGame();
    const { cup } = game.layout;
    expect(() => game.place(cup.x, cup.y - CUP.radius - 1.5)).toThrow(/near the cup/);
    expect(() => game.place(game.layout.originX + 1, game.layout.originY + 1)).toThrow(/grass/);
  });
});
