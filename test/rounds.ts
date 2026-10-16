/** Rounds played by hand in a test on the practice green: a hole holed in one, a hole picked up, and the wait between holes. */
import { expect } from 'vitest';
import { powerFor } from '../src/arena';
import { CLEAR_OF_CUP, type Game } from '../src/game';
import { DT } from './helpers';

export const NORTH = Math.PI / 2;

/** The hole in play holed in one. */
export function holeInOne(g: Game) {
  const { cup } = g.layout;
  g.place(cup.x, cup.y - CLEAR_OF_CUP - 0.1);
  g.shoot(NORTH, powerFor(8, g.hardest));
  for (let f = 0; f < 60 * 12 && g.phase === 'play'; f++) g.step(DT);
  expect(g.phase).not.toBe('play');
}

/** Whether a hole is in play, read afresh: a stroke may end it. */
const playing = (g: Game) => g.phase === 'play';

/** The hole in play picked up: tapped about at the tee until the limit is reached. */
export function pickUp(g: Game) {
  for (let s = 0; s < 20 && g.phase === 'play'; s++) {
    g.place(g.layout.tee.x, g.layout.tee.y);
    g.shoot(s % 2 ? 0 : Math.PI, 0.05);
    for (let f = 0; f < 60 * 40 && !(f > 2 && g.ready) && playing(g); f++) g.step(DT);
  }
  expect(g.phase).not.toBe('play');
}

/** The game moved on to the next hole, or to the end of the round. */
export function next(g: Game) {
  for (let f = 0; f < 60 * 3 && g.phase === 'done'; f++) g.step(DT);
}
