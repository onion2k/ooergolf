import { describe, expect, it } from 'vitest';
import { BALL, HARDEST_SHOT } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { onGreen as newGame, settle } from './helpers';

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
    world.x[ball] = game.layout.originX + 1;
    world.y[ball] = game.layout.originY + 1;
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

  it('reports a card with a score too many or too few, a score out of bounds, and strokes over the limit', () => {
    const { game } = newGame();
    game.card.push(2);
    expect(checkInvariants(game).join('\n')).toMatch(/the card has 1 scores, with 0 holes finished/);
    game.card.length = 0;
    game.phase = 'done';
    expect(checkInvariants(game).join('\n')).toMatch(/the card has 0 scores, with 1 holes finished/);
    game.card.push(0);
    expect(checkInvariants(game).join('\n')).toMatch(/hole 1 is scored 0/);
    game.card[0] = 3;
    game.phase = 'play';
    game.card.length = 0;
    game.strokes = 99;
    expect(checkInvariants(game).join('\n')).toMatch(/99 strokes on hole 1, over its limit/);
  });

  it('reports coins and gems that are not counts, a club no one sells, and a club in hand not owned', () => {
    const { game } = newGame();
    const save = game.progress.save;
    save.coins = -1;
    save.gems = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/the coins are -1[\s\S]*the gems are 0.5/);
    save.coins = save.gems = 0;
    save.owned.push('stolen');
    expect(checkInvariants(game).join('\n')).toMatch(/a club no one sells is owned: stolen/);
    save.owned.pop();
    save.club = 'gold';
    expect(checkInvariants(game).join('\n')).toMatch(/the club in hand, gold, is not owned/);
    save.club = 'putter';
    save.owned.length = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/the starting putter is not owned/);
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
