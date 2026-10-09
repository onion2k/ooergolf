/**
 * Trees in the game: a `^` in a golf hole's map is a tree, its trunk a post the physics has and its canopy a cone the
 * game tests the ball's path against every step. A drive that flies into one is stopped by it and drops; a high club
 * goes over it, the putter along the ground meets the trunk, and a ball lying under the canopy that rises into it is
 * knocked down. And the rules that hold whatever happens: a ball is never inside a canopy or a trunk, and never sped up
 * by either.
 */
import { describe, expect, it } from 'vitest';
import { TILE, fromTrees, layoutOf, tileLieAt as lieAt } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { Rehearsal } from '../src/planner';
import { LIE } from '../src/surfaces';
import { TREE } from '../src/trees';
import { DT, field, golfGame } from './helpers';

const NORTH = Math.PI / 2;

/** A fairway with one tree standing on it, `rows` tiles up from the tee's row, in the middle. */
function withTree(rows: number, across = 0) {
  const base = field('f');
  const tee = base.map.findIndex((r) => r.includes('T'));
  const row = tee - rows;
  const map = base.map.map((line, r) => {
    if (r !== row) return line;
    const mid = Math.floor(line.length / 2) + across;
    return line.slice(0, mid) + '^' + line.slice(mid + 1);
  });
  return { ...base, map };
}

/** Play until the ball is at rest or the hole is done, checking the rules every frame. */
function untilStill(game: ReturnType<typeof golfGame>['game'], seconds = 30) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    if (game.phase !== 'play' || (f > 1 && game.ready)) return;
  }
  throw new Error('the ball never came to rest');
}

describe('a tree in a map', () => {
  it('is a `^`: a golf tile, in the rough to the ball, its trunk where its tile’s middle is', () => {
    const l = layoutOf(['#####', '#gCg#', '#g^g#', '#gTg#', '#####']);
    expect(l.golf).toBe(true);
    expect(l.trees.length).toBe(1);
    const t = l.trees[0];
    expect(t.x).toBeCloseTo(l.originX + 2.5 * TILE, 9);
    expect(t.y).toBeCloseTo(l.originY + 2.5 * TILE, 9);
    expect(lieAt(l, t.x, t.y)).toBe(LIE.rough);
    expect(fromTrees(l, t.x + TREE.trunk + 2, t.y)).toBeCloseTo(2, 9);
    expect(fromTrees(layoutOf(['#####', '#gCg#', '#gTg#', '#####']), 0, 0)).toBe(Infinity);
  });

  it('is refused to a hole of minigolf: it is golf’s, and mixing it with the minigolf’s grass is refused by name', () => {
    expect(() => layoutOf(['####', '#.C#', '#^T#', '####'])).toThrow(/mixes/);
  });

  it('has a canopy in the game, at the tree, as high as the ground the trunk stands on and no higher', () => {
    const { game } = golfGame(withTree(30));
    expect(game.cones.length).toBe(1);
    expect(game.cones[0].base).toBe(TREE.base);
    expect(game.cones[0].apex).toBe(TREE.apex);
  });
});

describe('a ball and a tree', () => {
  it('is stopped by the canopy when it is a drive, which is flying at a dozen units: it drops short of the tree and never passes it', () => {
    const { game, told } = golfGame(withTree(36));
    const tree = game.layout.trees[0];
    game.pick('driver');
    game.shoot(NORTH, 1);
    let farthest = -Infinity;
    for (let f = 0; f < 60 * 30; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      farthest = Math.max(farthest, game.world.y[game.ball]);
      if (f > 1 && game.ready) break;
    }
    expect(game.ready).toBe(true);
    // it never got past the tree, or nearly so: stopped by the canopy on the near side, out of the branches
    expect(farthest, 'never past the trunk’s line by more than its canopy is wide').toBeLessThan(tree.y + TREE.radius);
    expect(game.world.y[game.ball]).toBeLessThan(tree.y + TREE.radius);
    expect(told.filter((t) => t.startsWith('knocked ')).length, 'a knock, told').toBeGreaterThan(0);
  });

  it('goes over a tree with a high club, which is not touched, and comes down beyond it', () => {
    // 38 units short of the tree, a sand wedge at full power, which is over twenty-five up as it passes: the window a wedge
    // clears a tree of twenty in is about 26 to 51 units short of it, and nearer or further it is in the branches
    const { game } = golfGame(withTree(36));
    const tree = game.layout.trees[0];
    game.place(tree.x, tree.y - 38);
    game.pick('sand-wedge');
    game.shoot(NORTH, 1);
    for (let f = 0; f < 60 * 30; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      if (f > 1 && game.ready) break;
    }
    expect(game.world.y[game.ball], 'beyond the tree').toBeGreaterThan(tree.y + 20);
  });

  it('is in the branches when a wedge is too near or too far to clear the tree: the same club, at 15 units short', () => {
    const { game } = golfGame(withTree(36));
    const tree = game.layout.trees[0];
    game.place(tree.x, tree.y - 15);
    game.pick('sand-wedge');
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(game.world.y[game.ball], 'not over it').toBeLessThan(tree.y + TREE.radius);
  });

  it('meets the trunk with the putter along the ground: it comes back off it, dead, and does not pass', () => {
    const { game } = golfGame(withTree(12));
    const tree = game.layout.trees[0];
    game.pick('putter');
    game.shoot(NORTH, 1);
    let farthest = -Infinity;
    for (let f = 0; f < 60 * 20; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      farthest = Math.max(farthest, game.world.y[game.ball]);
      if (f > 1 && game.ready) break;
    }
    expect(farthest, 'never past the trunk').toBeLessThan(tree.y);
    // and back off it, short of where it met it
    expect(game.world.y[game.ball]).toBeLessThan(tree.y - TREE.trunk);
  });

  it('is knocked down by a canopy that a ball lying under it rises into, and rests near the trunk', () => {
    const { game } = golfGame(withTree(30));
    const tree = game.layout.trees[0];
    // three units short of the trunk, under the canopy; a 5-iron, which rises at 27 degrees, into the underside
    game.place(tree.x, tree.y - 3);
    game.pick('5-iron');
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(game.world.y[game.ball], 'it did not get through').toBeLessThan(tree.y + TREE.radius + 2);
    expect(game.ready).toBe(true);
  });

  it('is never inside a canopy or a trunk, whatever it is struck at it, from anywhere, at any power', () => {
    let hits = 0;
    for (const club of ['driver', '3-wood', '5-iron', '9-iron', 'sand-wedge']) {
      for (const [offset, power] of [
        [0, 1],
        [1, 0.8],
        [-1, 0.6],
        [2, 1],
        [0, 0.45],
      ] as const) {
        const { game, told } = golfGame(withTree(24, 0));
        game.pick(club);
        game.shoot(NORTH + offset * 0.03, power);
        untilStill(game);
        hits += told.filter((t) => t.startsWith('knocked ')).length > 0 ? 1 : 0;
      }
    }
    expect(hits, 'a good many of them met the tree').toBeGreaterThan(8);
  });

  it('is never put down on a trunk', () => {
    const { game } = golfGame(withTree(30));
    const tree = game.layout.trees[0];
    expect(() => game.place(tree.x, tree.y)).toThrow(/tree/);
    expect(() => game.place(tree.x + TREE.trunk, tree.y)).toThrow(/tree/);
  });

  it('is what a rehearsal finds too, so a plan is made round the trees that are there', () => {
    const { game } = golfGame(withTree(36));
    const r = new Rehearsal(game.rehearsal());
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const tree = game.layout.trees[0];
    const t = r.shot(from, 'driver', NORTH, 1);
    expect(t.y).toBeLessThan(tree.y + TREE.radius);
    // and a shot to one side of it goes past
    const past = r.shot(from, 'driver', NORTH + 0.12, 1);
    expect(past.y).toBeGreaterThan(tree.y + 40);
  });
});

describe('what must always hold near a tree', () => {
  it('reports a ball inside a canopy and inside a trunk', () => {
    const { game } = golfGame(withTree(30));
    const tree = game.layout.trees[0];
    game.world.x[game.ball] = tree.x + 1;
    game.world.y[game.ball] = tree.y;
    game.world.z[game.ball] = TREE.base + 6;
    expect(checkInvariants(game).join('\n')).toMatch(/inside a tree's canopy/);
    game.world.z[game.ball] = 2;
    expect(checkInvariants(game).join('\n')).toMatch(/inside a tree's trunk/);
  });
});
