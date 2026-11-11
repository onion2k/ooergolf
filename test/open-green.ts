/**
 * A green with the cup in its middle and room all round, and a putt struck at the cup from just clear of it, which the
 * tests of what the cup catches and of what is told of a ball at the cup both stand on: said once, so that what a
 * putt at a speed does is one thing in both.
 */
import { HARDEST_SHOT, ROLL, powerFor } from '../src/arena';
import { CUP } from '../src/course';
import type { HoleDef } from '../src/course';
import { CLEAR_OF_CUP, type Game } from '../src/game';

/** A flat minigolf green `rows` tiles each side of the cup, with room all round, so a ball that runs past goes on. */
export function openGreen(rows: number, name = 'Open green'): HoleDef {
  return {
    name,
    par: 2,
    map: [
      '#################',
      ...Array.from({ length: rows }, () => '#...............#'),
      '#.......C.......#',
      ...Array.from({ length: rows }, () => '#...............#'),
      '#.......T.......#',
      '#################',
    ],
  };
}

/** The usual green, seven tiles each side. */
export const OPEN: HoleDef = openGreen(7);

/**
 * A ball put down `back` yards short of the cup's clear distance, `aside` off its middle, and struck at the cup so as to
 * arrive at the cup's edge at `speed`, as the cup test's putts are. Not a stroke put down: it is struck as the game's
 * next stroke is, which is its first unless the caller says it was not.
 */
export function shootAtCup(game: Game, speed: number, aside = 0, back = 0.1) {
  const { cup } = game.layout;
  const y0 = cup.y - CLEAR_OF_CUP - back;
  game.place(cup.x + aside, y0);
  const toEdge = cup.y - Math.sqrt(Math.max(0, CUP.radius ** 2 - aside ** 2)) - y0;
  game.shoot(Math.PI / 2, powerFor(Math.sqrt(speed * speed + 2 * ROLL.roll * toEdge), HARDEST_SHOT));
}
