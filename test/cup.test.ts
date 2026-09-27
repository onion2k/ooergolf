/**
 * What the cup catches, measured on an open green. With the physics now in
 * the game a ball drops if it is slow enough to fall below the floor before
 * it has crossed the hole, and the pull toward the hole catches a slow one
 * passing near: through the middle, every putt up to 19 a second drops and
 * every one from 20 runs over; off the middle, the catch is slower. There is
 * no rim yet to throw a ball back out or turn it: artshape-physics 0.4.0
 * brings that, and this test is set again then, with the cup's width chosen
 * from the table that version gives.
 *
 * On a hole a ball that runs over can still drop, off a rail close behind
 * the cup and back: the first hole's cup is a tile from its far rail.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT } from '../src/arena';
import { CUP } from '../src/course';
import type { HoleDef } from '../src/course';
import { CLEAR_OF_CUP } from '../src/game';
import { DT, newGame } from './helpers';

/**
 * A green with the cup in its middle and room all round, so a ball that runs
 * past goes on and stops, and does not bank off a rail close behind and roll
 * back in, as it can on the first hole.
 */
const OPEN: HoleDef = {
  name: 'Open green',
  par: 2,
  map: [
    '#################',
    ...Array.from({ length: 7 }, () => '#...............#'),
    '#.......C.......#',
    ...Array.from({ length: 7 }, () => '#...............#'),
    '#.......T.......#',
    '#################',
  ],
};

/** Whether a ball struck at the cup at `speed` from just clear of it, `aside` off its middle, is holed. */
function holes(speed: number, aside = 0): boolean {
  const { game } = newGame(1, null, [OPEN]);
  const { cup } = game.layout;
  game.place(cup.x + aside, cup.y - CLEAR_OF_CUP - 0.1);
  game.shoot(Math.PI / 2, speed / HARDEST_SHOT);
  for (let f = 0; f < 300 && game.phase === 'play'; f++) game.step(DT);
  return game.phase === 'done';
}

describe('the cup', () => {
  /** Through the cup `aside` off its middle: every speed up to `caught` drops, and every one from `over` to the hardest shot runs on. */
  const holds = (aside: number, caught: number, over: number) => {
    for (let v = 4; v <= caught; v += 1) expect(holes(v, aside), `${v} a second, ${aside.toFixed(2)} aside`).toBe(true);
    for (let v = over; v <= HARDEST_SHOT; v += 2)
      expect(holes(v, aside), `${v} a second, ${aside.toFixed(2)} aside`).toBe(false);
  };

  it('catches every putt through the middle up to 18 a second, and lets every one from 22 run over', () => {
    holds(0, 18, 22);
  });

  it('catches slower off the middle: up to 12 at 0.8 of its radius, up to 9 wide of it', () => {
    holds(CUP.radius * 0.8, 12, 16);
    holds(CUP.radius * 1.2, 9, 14);
  });

  it('refuses a ball put down where the cup would draw it in before it is played', () => {
    const { game } = newGame(1, null, [OPEN]);
    const { cup } = game.layout;
    expect(() => game.place(cup.x, cup.y - CUP.radius - 1.5)).toThrow(/near the cup/);
    expect(() => game.place(game.layout.originX + 1, game.layout.originY + 1)).toThrow(/grass/);
  });
});
