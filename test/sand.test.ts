/** Sand: a ball rolled into it stops short, as its slowing says, and can be played out of it. */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, ROLL, SAND, TILE, powerFor } from '../src/arena';
import type { HoleDef } from '../src/course';
import { COURSE } from '../src/course';
import { DT, newGame } from './helpers';

/** A lane of green, and sand across it from the fourth row. */
const LANE: HoleDef = {
  name: 'test sand',
  par: 3,
  map: [
    '#####',
    '#.C.#',
    ...Array.from({ length: 4 }, () => '#...#'),
    ...Array.from({ length: 6 }, () => '#sss#'),
    ...Array.from({ length: 4 }, () => '#...#'),
    '#.T.#',
    '#####',
  ],
};

describe('sand', () => {
  it('stops a ball that rolls into it as a steady slowing much heavier than the green', () => {
    expect(SAND.roll).toBe(60);
    for (const arrive of [10, 20, 30]) {
      const { game } = newGame(1, null, [LANE]);
      const l = game.layout;
      // the sand begins with the sixth row of tiles from the south, from the tee's end
      const edge = l.originY + 6 * TILE;
      const from = edge - 6;
      game.place(l.tee.x, from);
      game.shoot(Math.PI / 2, powerFor(Math.sqrt(arrive * arrive + 2 * ROLL.roll * 6), HARDEST_SHOT));
      for (let f = 0; f < 600 && !(f > 1 && game.ready); f++) game.step(DT);
      const into = game.world.y[game.ball] - edge;
      expect(
        Math.abs(into - (arrive * arrive) / (2 * SAND.roll)),
        `arriving at ${arrive}, ${into.toFixed(2)} in`,
      ).toBeLessThan(0.6);
    }
  });

  it('can be played out of: a ball at rest in it, struck hard enough, rolls out onto the green', () => {
    const { game } = newGame(1, null, [LANE]);
    const l = game.layout;
    // the sand's far edge, twelve rows from the south
    const edge = l.originY + 12 * TILE;
    // three units in, from the far side of the sand; out of it takes the sand's slowing over those three
    game.place(l.tee.x, edge - 3);
    game.shoot(Math.PI / 2, powerFor(Math.sqrt(2 * SAND.roll * 3 + 2 * ROLL.roll * 4), HARDEST_SHOT));
    for (let f = 0; f < 600 && !(f > 1 && game.ready); f++) game.step(DT);
    expect(game.world.y[game.ball] - edge, 'out on the green, a few units on').toBeGreaterThan(2);
  });

  it('is on the course, on a hole of its own, guarding the cup', () => {
    const hole = COURSE.find((h) => h.name === 'The Bunker')!;
    expect(COURSE.indexOf(hole), 'the third hole').toBe(2);
    expect(hole.map.join('')).toContain('s');
  });
});
