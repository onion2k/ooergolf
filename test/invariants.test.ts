import { describe, expect, it } from 'vitest';
import { BALL, ORIGIN_X, ORIGIN_Y } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { newGame, settle } from './helpers';

/** A game with one ball on the course, at rest, and the slot it is in. */
function withBall() {
  const { game } = newGame();
  const slot = game.world.spawn(BALL, 0, 0, 2);
  settle(game);
  return { game, slot };
}

describe('what must always hold', () => {
  it('holds of a new game, and of one with a ball on the course', () => {
    const { game } = newGame();
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
    expect(checkInvariants(withBall().game)).toEqual([]);
  });

  it('reports a ball in the rock, and a ball that is not a number', () => {
    const { game, slot } = withBall();
    game.world.x[slot] = ORIGIN_X + 1;
    game.world.y[slot] = ORIGIN_Y + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/in the rock: ball/);
    game.world.x[slot] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number: ball/);
  });

  it('reports a body of no kind, a count that is out, and a time that is not one', () => {
    const { game, slot } = withBall();
    game.world.kind[slot] = 9;
    expect(checkInvariants(game).join('\n')).toMatch(/of no kind \(9\)/);
    game.world.kind[slot] = BALL;
    game.world.alive[slot] = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/counts 1 live, and has 0/);
    game.world.alive[slot] = 1;
    expect(checkInvariants(game)).toEqual([]);
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the time is NaN/);
  });
});
