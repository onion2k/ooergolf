/**
 * The rule that a ball at rest on a golf hole lies as the zones say (`lieProblems`): the lie the game reads under the ball is
 * the zone's, which is what the ground is drawn by. Without it a ground that drifted from the lie would pass in silence, since
 * the fuzzer only sees what the game does and not what is drawn.
 */
import { describe, expect, it } from 'vitest';
import { lieAt } from '../src/arena';
import { lieProblems } from '../src/invariants';
import { LIE } from '../src/surfaces';
import { BAG, PUTTER } from '../src/bag';
import { zonesOf } from '../src/zones';
import { field, golfGame, newGame } from './helpers';

describe('lieProblems', () => {
  it('finds nothing on the lies of a golf hole, tile after tile', () => {
    const { game } = golfGame(field('g'));
    const l = game.layout;
    let looked = 0;
    for (let x = l.bounds.minX; x < l.bounds.maxX; x += 1.7)
      for (let y = l.bounds.minY; y < l.bounds.maxY; y += 1.9) {
        game.inHand = PUTTER;
        expect(lieProblems(game, x, y), `at ${x},${y}`).toEqual([]);
        looked++;
      }
    expect(looked).toBeGreaterThan(500);
  });

  it('reports a lie that is not the zone the ground is drawn as', () => {
    const { game } = golfGame(field('f'));
    const { x, y } = game.layout.tee;
    expect(zonesOf(game.layout).at(x, y)).toBe('tee');
    expect(lieAt(game.layout, x, y)).toBe(LIE.tee);
    expect(lieProblems(game, x, y)).toEqual([]);
    expect(lieProblems(game, x, y, LIE.rough).join()).toMatch(/where the ground is tee/);
  });

  it('wants the putter in hand for a ball come to rest on the putting green, and nothing else in particular', () => {
    const { game } = golfGame(field('g'));
    const where = { x: game.layout.cup.x + 6, y: game.layout.cup.y - 8 };
    expect(zonesOf(game.layout).at(where.x, where.y)).toBe('putting');
    game.inHand = BAG[0];
    expect(lieProblems(game, where.x, where.y).join()).toMatch(/not the putter/);
    game.inHand = PUTTER;
    expect(lieProblems(game, where.x, where.y)).toEqual([]);
    const sand = golfGame(field('r')).game;
    sand.inHand = BAG[0];
    expect(lieProblems(sand, sand.layout.tee.x, sand.layout.tee.y - 20)).toEqual([]);
  });

  it('has nothing to say on a hole of minigolf, which has no zones', () => {
    const game = newGame();
    expect(lieProblems(game.game, game.game.layout.tee.x, game.game.layout.tee.y)).toEqual([]);
  });
});
