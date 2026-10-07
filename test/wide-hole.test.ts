/**
 * The hole the page's failure tests use, held to what they use it for: one that the game plays and the scene's models are built
 * for, and that only the field of grass refuses. The smoke test of a hole that cannot be drawn begins it mid-round, and means
 * the grass to be what stops it: were the limit to move and the hole be covered, or were something else to refuse it, that test
 * would be about another failure than it says.
 */
import { describe, expect, it } from 'vitest';
import { clearings } from '../src/scenery';
import { Scene } from '../src/scene';
import { cellFor, fieldOf, windOf } from '../src/turf';
import { layoutOf } from '../src/arena';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { corridor, tooLong, wideHole } from './wide-hole';

describe('the hole the grass refuses', () => {
  it('is the first corridor the field of grass will not cover, and the one before it is covered', () => {
    const cols = tooLong();
    expect(() => cellFor(layoutOf(corridor(cols).map))).toThrow(RangeError);
    expect(() => cellFor(layoutOf(corridor(cols - 1).map))).not.toThrow();
    // a corridor of that length is what the hole is
    expect(wideHole().map[0]).toHaveLength(cols);
  });

  it('is played by the game, and its scene is built as for any hole: it is the field of grass alone that refuses it', () => {
    const hole = wideHole();
    const game = new Game(new Progress(memoryStore()), {}, { course: [hole] });
    expect(game.phase, 'the game begins it').toBe('play');
    const { layout } = game;
    const scene = new Scene();
    expect(scene.static(layout, hole.name, game.obstacles, game.cup.radius).length).toBeGreaterThan(0);
    expect(scene.dynamic(game.obstacles, layout, hole.name, windOf(hole.name), {}).length).toBeGreaterThan(0);
    expect(() => fieldOf(layout, hole.name, clearings(layout, hole.name))).toThrow(/more than a field of grass covers/);
  });
});
