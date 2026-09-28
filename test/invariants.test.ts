import { describe, expect, it } from 'vitest';
import { BALL, BUMPER, FASTEST, HARDEST_SHOT } from '../src/arena';
import type { HoleDef } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { newGame as newOn, onGreen as newGame, settle } from './helpers';

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

  it('reports a ball inside something that moves', () => {
    const { game } = newGame();
    const { world, ball } = game;
    expect(checkInvariants(game)).toEqual([]);
    game.obstacles.pushers.push({
      x: world.x[ball],
      y: world.y[ball],
      z: world.z[ball],
      yaw: 0,
      hx: 2,
      hy: 2,
      hz: 2,
      vx: 0,
      vy: 0,
      spin: 0,
      px: 0,
      py: 0,
      owner: 0,
    });
    expect(checkInvariants(game).join('\n')).toMatch(/inside a moving box/);
  });

  it('reports a ball at rest in the air, with nothing under it', () => {
    const { game } = newGame();
    const { world, ball } = game;
    expect(world.asleep[ball], 'at rest on the tee').toBe(1);
    expect(checkInvariants(game)).toEqual([]);
    world.z[ball] += 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/at rest in the air: ball/);
    // moving, it may be in the air: thrown up by the rim, or off an edge
    world.wake(ball);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a ball inside a post, and takes one at rest on the top of a post as lying on something', () => {
    const POST: HoleDef = {
      name: 'test post',
      par: 3,
      map: ['#####', '#.C.#', '#...#', '#.o.#', '#...#', '#.T.#', '#####'],
    };
    const { game } = newOn(1, null, [POST]);
    const { world, ball } = game;
    const post = game.layout.bumpers[0];
    expect(checkInvariants(game)).toEqual([]);
    world.x[ball] = post.x + BUMPER.radius;
    world.y[ball] = post.y;
    expect(checkInvariants(game).join('\n')).toMatch(/inside a post/);
    // on its top, which is a floor to what lands on it, and asleep there
    world.x[ball] = post.x;
    world.z[ball] = BUMPER.height + world.r[ball];
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    world.asleep[ball] = 1;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('lets a post throw a ball half as fast again as the club struck it, and no faster', () => {
    const { game } = newGame();
    game.shoot(0, 1);
    game.world.vx[game.ball] = HARDEST_SHOT * FASTEST * 0.999;
    expect(checkInvariants(game)).toEqual([]);
    game.world.vx[game.ball] = HARDEST_SHOT * FASTEST * 1.01;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than a post may throw it/);
  });

  it('holds the ball to the club that struck it, not to one put in hand while it rolls', () => {
    const { game } = newGame();
    game.progress.save.owned.push('gold');
    game.equip('gold');
    const gold = game.hardest;
    expect(gold, 'a club harder than the putter').toBeGreaterThan(HARDEST_SHOT);
    game.shoot(0, 1);
    expect(game.equip('putter')).toBe(true);
    expect(game.hardest).toBe(HARDEST_SHOT);
    // thrown by a post faster than any the putter could have been, but no faster than the gold's
    game.world.vx[game.ball] = gold * FASTEST * 0.99;
    expect(gold * FASTEST * 0.99, 'past what the putter allows').toBeGreaterThan(HARDEST_SHOT * FASTEST);
    expect(checkInvariants(game), 'struck by the gold, and going as a post may throw what the gold struck').toEqual([]);
    game.world.vx[game.ball] = gold * FASTEST * 1.01;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than a post may throw it/);
  });

  it('reports strokes that are not a count', () => {
    const { game } = newGame();
    game.shoot(0, 1);
    expect(checkInvariants(game)).toEqual([]);
    game.strokes = 1.5;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are 1.5/);
    game.strokes = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are -1/);
  });
});
