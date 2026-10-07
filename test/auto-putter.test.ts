/**
 * The putter on the green: a ball come to rest on the putting green of a golf hole has the putter in hand for the next
 * shot, and the player may choose another club over it. Without it every putt began with a trip to the bag.
 */
import { describe, expect, it } from 'vitest';
import { field, golfGame, newGame, settle } from './helpers';

/** Strike the ball from the tee of a one-surface hole, stepping until it rests, and say the club in hand then. */
function restOn(surface: 'f' | 'r' | 'g' | 's', power = 0.4) {
  const { game } = golfGame(field(surface, 80, 21));
  game.pick('7-iron');
  expect(game.shoot(Math.PI / 2, power)).toBe(true);
  settle(game, 1800);
  expect(game.ready).toBe(true);
  return game;
}

describe('the putter on the green', () => {
  it('is in hand when the ball comes to rest on the putting green', () => {
    expect(restOn('g').inHand.id).toBe('putter');
  });

  it('is not put in hand for a ball at rest on the fairway, the rough or the sand', () => {
    for (const surface of ['f', 'r', 's'] as const) expect(restOn(surface).inHand.id, surface).toBe('7-iron');
  });

  it('may be overridden by the player, and holds until the ball next comes to rest', () => {
    const game = restOn('g');
    expect(game.pick('sand-wedge')).toBe(true);
    expect(game.inHand.id).toBe('sand-wedge');
  });

  it('leaves minigolf alone', () => {
    const { game } = newGame(1);
    const before = game.inHand.id;
    expect(game.shoot(0.5, 0.3)).toBe(true);
    settle(game, 1800);
    expect(game.inHand.id).toBe(before);
  });
});
