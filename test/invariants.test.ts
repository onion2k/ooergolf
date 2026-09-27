import { describe, expect, it } from 'vitest';
import { BALL, HARDEST_SHOT, ORIGIN_X, ORIGIN_Y } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { newGame, settle } from './helpers';

describe('what must always hold', () => {
  it('holds of a new game, and of one played on a little', () => {
    const { game } = newGame();
    expect(checkInvariants(game)).toEqual([]);
    game.shoot(1, 0.7);
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a ball in the rock, and a ball that is not a number', () => {
    const { game } = newGame();
    const { world, ball } = game;
    world.x[ball] = ORIGIN_X + 1;
    world.y[ball] = ORIGIN_Y + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/in the rock: ball/);
    world.x[ball] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number: ball/);
  });

  it('reports a body of no kind, a count that is out, and a time that is not one', () => {
    const { game } = newGame();
    const { world, ball } = game;
    world.kind[ball] = 9;
    expect(checkInvariants(game).join('\n')).toMatch(/of no kind \(9\)/);
    world.kind[ball] = BALL;
    world.alive[ball] = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/counts 1 live, and has 0/);
    world.alive[ball] = 1;
    expect(checkInvariants(game)).toEqual([]);
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the time is NaN/);
  });

  it('reports a second ball, and the ball gone', () => {
    const { game } = newGame();
    const other = game.world.spawn(BALL, 5, 5, 1);
    expect(checkInvariants(game).join('\n')).toMatch(/2 bodies on the course, and only the ball should be/);
    game.world.remove(other);
    game.world.remove(game.ball);
    expect(checkInvariants(game).join('\n')).toMatch(/the ball is gone/);
  });

  it('reports a ball faster than the hardest shot, and strokes that are not a count', () => {
    const { game } = newGame();
    game.shoot(0, 1);
    expect(checkInvariants(game)).toEqual([]);
    game.world.vx[game.ball] = HARDEST_SHOT * 1.1;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than the hardest shot/);
    game.world.vx[game.ball] = 0;
    game.strokes = 1.5;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are 1.5/);
    game.strokes = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are -1/);
  });
});
