/** The track a ball leaves in the grass: laid as it rolls, faded in a few seconds, held to a size, and cleared for a hole. */
import { describe, expect, it } from 'vitest';
import { STEP, TILE } from '../src/arena';
import type { HoleDef } from '../src/course';
import { TRAIL, Trail, trailFrom } from '../src/trail';
import { DT, newGame } from './helpers';

describe('a track', () => {
  it('is laid as the ball rolls, a strip for every little way it goes, and none while it is still', () => {
    const trail = new Trail();
    trail.lay(0, 0, 0, 0);
    trail.lay(0, 0, 0, 0.5);
    expect(trail.count, 'no strip while still').toBe(0);
    for (let k = 1; k <= 10; k++) trail.lay(k * 0.3, 0, 0, k * 0.1);
    expect(trail.count).toBeGreaterThanOrEqual(4);
    expect(trail.count).toBeLessThanOrEqual(6);
    for (let i = 0; i < trail.count; i++) expect(trail.length[i]).toBeGreaterThanOrEqual(TRAIL.spacing - 1e-6);
  });

  it('is broken where the ball is lifted, and joined up again nowhere between', () => {
    const trail = new Trail();
    for (let k = 0; k <= 4; k++) trail.lay(k, 0, 0, k);
    const n = trail.count;
    trail.lift();
    trail.lay(20, 0, 0, 5);
    trail.lay(21, 0, 0, 6);
    expect(trail.count).toBe(n + 1);
    // no strip spans the jump from 4 to 20
    for (let i = 0; i < trail.count; i++) expect(trail.length[i]).toBeLessThan(2);
  });

  it('fades from its darkest to nothing over its time, and is gone after', () => {
    const trail = new Trail();
    trail.lay(0, 0, 0, 0);
    trail.lay(1, 0, 0, 0);
    expect(trail.shade(0, 0)).toBeCloseTo(1, 6);
    expect(trail.shade(0, TRAIL.fade / 2)).toBeGreaterThan(0.2);
    expect(trail.shade(0, TRAIL.fade / 2)).toBeLessThan(0.8);
    expect(trail.shade(0, TRAIL.fade)).toBe(0);
    expect(trail.shade(0, TRAIL.fade * 3)).toBe(0);
  });

  it('holds no more than its capacity, the oldest going first, and is emptied when asked', () => {
    const trail = new Trail();
    for (let k = 0; k < TRAIL.capacity * 3; k++) trail.lay(k, 0, 0, k * 0.01);
    expect(trail.count).toBe(TRAIL.capacity);
    const newest = Math.max(...Array.from(trail.born.subarray(0, trail.count)));
    expect(newest).toBeCloseTo((TRAIL.capacity * 3 - 1) * 0.01, 5);
    trail.clear();
    expect(trail.count).toBe(0);
  });
});

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
