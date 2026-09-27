import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { DT, newGame, settle } from './helpers';

describe('the game', () => {
  it('starts as an empty course: nothing on it, and nothing that must hold broken', () => {
    const { game, told } = newGame();
    expect(game.world.live).toBe(0);
    settle(game);
    expect(game.world.live).toBe(0);
    expect(told).toEqual([]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('has nothing of the stub left in it: no sled, and no bank in the save', () => {
    const { game } = newGame();
    expect('sled' in game).toBe(false);
    expect(game.progress.save).toEqual({});
  });

  it('keeps time a step at a time', () => {
    const { game } = newGame();
    for (let f = 0; f < 60; f++) game.step(DT);
    expect(game.t).toBeCloseTo(1, 9);
  });

  it('holds a ball put on the course: it lands on the floor and stays there', () => {
    const { game } = newGame(2);
    const slot = game.world.spawn(BALL, 3, -4, 6);
    expect(slot).toBeGreaterThanOrEqual(0);
    settle(game, 300);
    expect(game.world.live).toBe(1);
    expect(game.world.x[slot]).toBeCloseTo(3, 0);
    expect(game.world.y[slot]).toBeCloseTo(-4, 0);
    expect(game.world.z[slot]).toBeCloseTo(KIND_RADIUS[BALL], 1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('writes the save when asked, and not before', () => {
    const { game, store } = newGame(3);
    settle(game);
    expect(store.json).toBe(null);
    game.persist();
    expect(store.json).toBe('{}');
  });
});
