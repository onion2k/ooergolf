/** Where a ball presses the grass: under it as it rolls on the grass, and nowhere in the air, over water or in the cup. */
import { describe, expect, it } from 'vitest';
import { STEP, TILE } from '../src/arena';
import type { HoleDef } from '../src/course';
import { trailFrom } from '../src/trail';
import { DT, newGame } from './helpers';

describe('where a ball leaves a track', () => {
  const HOLE: HoleDef = {
    name: 'test track',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#~~~~.#', '#11111#', '#.....#', '#..T..#', '#######'],
  };

  it('on the grass under it, at the grass height, while it rolls', () => {
    const { game } = newGame(1, null, [HOLE]);
    expect(trailFrom(game), 'still on the tee').toBe(null);
    game.shoot(Math.PI / 2, 0.3);
    for (let f = 0; f < 10; f++) game.step(DT);
    const at = trailFrom(game)!;
    expect(at).not.toBe(null);
    expect(at.x).toBeCloseTo(game.world.x[game.ball], 6);
    expect(at.z).toBeCloseTo(0, 1);
    // up on the raised step, at its height
    game.place(game.layout.originX + 5.5 * TILE, game.layout.originY + 3.5 * TILE);
    game.shoot(0, 0.05);
    game.step(DT);
    game.step(DT);
    expect(trailFrom(game)!.z).toBeCloseTo(STEP, 1);
  });

  it('nowhere over water, nor in the cup', () => {
    const { game } = newGame(1, null, [HOLE]);
    const l = game.layout;
    game.world.x[game.ball] = l.originX + 1.5 * TILE;
    game.world.y[game.ball] = l.originY + 4.5 * TILE;
    game.world.vy[game.ball] = 5;
    expect(trailFrom(game), 'over water').toBe(null);
    // crossing the cup at the height of the grass, before it drops
    game.world.x[game.ball] = l.cup.x + 0.5;
    game.world.y[game.ball] = l.cup.y;
    game.world.z[game.ball] = 1;
    expect(trailFrom(game), 'over the cup').toBe(null);
  });
});
