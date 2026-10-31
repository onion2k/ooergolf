/**
 * A tree is whatever its biome says: earth's, a cactus the desert's (smaller, and a ball that meets it drops at its foot), a
 * hologram the future's (a canopy with no trunk, which a ball passes through at half its speed and never turns), and none on
 * the Moon. In the shape of `flipper.test.ts`: a ball driven into each at the fastest there is, low and high, dropped on from above
 * and risen into from under, never passing through what it should not, and the same from the same seed.
 */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, TILE, fromTrees, heightAt, layoutOf } from '../src/arena';
import { BIOMES, treeOf, type BiomeName } from '../src/biome';
import type { HoleDef } from '../src/course';
import { golfHole } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { LINKS_SPECS } from '../src/links';
import { TREE, insideCanopy } from '../src/trees';
import { DT, golfGame, levelHole } from './helpers';

const NORTH = Math.PI / 2;
const KINDS = ['earth', 'desert', 'future'] as const satisfies readonly BiomeName[];

/** A level hole with one tree `along` the way of play, straight ahead, in `biome`. */
const treed = (biome: BiomeName, along: number, across = 0): HoleDef =>
  levelHole({
    name: `tree in the ${biome}`,
    par: 4,
    length: 280,
    rough: 8,
    ...(biome === 'earth' ? {} : { biome }),
    trees: [{ along, across }],
  });

/** A ball struck and followed until it is ready, the rules held every frame: what it did and where it came to rest. */
function through(def: HoleDef, club: string, power: number, from?: { x: number; y: number }, angle = NORTH) {
  const { game, calls } = golfGame(def);
  if (from) game.place(from.x, from.y);
  game.pick(club);
  expect(game.shoot(angle, power)).toBe(true);
  const path: number[][] = [];
  for (let f = 0; f < 60 * 40 && !game.ready; f++) {
    game.step(DT);
    const { world, ball } = game;
    path.push([
      world.x[ball],
      world.y[ball],
      world.z[ball],
      Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]),
    ]);
    expect(checkInvariants(game), `${club} frame ${f}`).toEqual([]);
  }
  expect(game.ready, `${club} came to rest`).toBe(true);
  return { game, calls, path };
}

describe('the figures of a tree', () => {
  it('are earth’s own object on earth, a cactus’s in the desert, a hologram’s in the future and none on the Moon', () => {
    expect(BIOMES.earth.tree).toBe(TREE);
    expect(BIOMES.desert.tree).toMatchObject({ trunk: 0.8, base: 2, apex: 15, radius: 4, restitution: 0.1 });
    expect(BIOMES.desert.tree?.glance).toEqual({ bounce: 0.05, keep: 0.1 });
    expect(BIOMES.future.tree).toMatchObject({ base: TREE.base, apex: TREE.apex, radius: TREE.radius });
    expect(BIOMES.future.tree?.passes).toEqual({ keep: 0.5 });
    expect(BIOMES.earth.tree?.passes).toBeUndefined();
    expect(BIOMES.desert.tree?.passes).toBeUndefined();
    expect(BIOMES.moon.tree).toBeNull();
  });

  it('are read through the layout, and a green’s keep-clear holds for the widest', () => {
    for (const biome of KINDS) {
      const { game } = golfGame(treed(biome, 200));
      expect(treeOf(game.layout), biome).toBe(BIOMES[biome].tree);
    }
    // a tree is kept 9 tiles from the cup (`KEEP.green`): further than any canopy reaches
    for (const b of Object.values(BIOMES)) if (b.tree) expect(b.tree.radius + KIND_RADIUS[BALL]).toBeLessThan(9 * TILE);
  });
});

describe('the Moon has no tree', () => {
  it('refuses a spec that asks for one, by name, and a map that draws one', () => {
    const spec = { ...LINKS_SPECS[0], biome: 'moon' as const };
    expect(spec.trees).toBeGreaterThan(0);
    expect(() => golfHole(spec)).toThrow(/moon.*tree|tree.*moon/i);
    expect(() => golfHole({ ...spec, trees: 0 })).not.toThrow();
    expect(() => golfHole({ ...spec, trees: 0, woods: true })).toThrow(/wood/);
    expect(() => golfHole({ ...spec, trees: 0, gap: { to: 200 } })).toThrow(/gap/);
    expect(() => layoutOf(treed('earth', 100).map, undefined, undefined, 'moon')).toThrow(/tree/);
    expect(golfHole({ ...spec, trees: 0 }).map.every((row) => !row.includes('^'))).toBe(true);
    expect(golfGame(levelHole({ name: 'bare', par: 3, length: 150, biome: 'moon' })).game.layout.trees).toEqual([]);
  });
});

describe('a ball driven into a tree', () => {
  for (const biome of KINDS) {
    it(`in the ${biome}, low and high, at the fastest there is, holds the rules and is never inside it`, () => {
      let met = 0;
      for (const club of ['driver', '5-iron', 'sand-wedge']) {
        for (let along = 40; along <= 200; along += 20) {
          for (const across of [0, 3]) {
            const run = through(treed(biome, along, across * 1), club, 1);
            if (run.calls.some(([c]) => c === 'knocked' || c === 'flickered')) met++;
          }
        }
      }
      expect(met, 'a good many met the tree').toBeGreaterThan(5);
    });
  }

  it('does not tunnel through a cactus’s post at the fastest shot there is: a putter along the ground comes back', () => {
    const { game } = golfGame(treed('desert', 60));
    const tree = game.layout.trees[0];
    game.pick('putter');
    expect(game.shoot(NORTH, 1)).toBe(true);
    let past = false;
    for (let f = 0; f < 60 * 20 && !game.ready; f++) {
      game.step(DT);
      if (game.world.y[game.ball] > tree.y + 1.2) past = true;
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(past, 'it passed the post').toBe(false);
    expect(game.world.y[game.ball]).toBeLessThan(tree.y);
  });

  it('is dropped on from above by a wedge, and risen into from under, and the rules hold throughout', () => {
    for (const biome of KINDS) {
      const figures = BIOMES[biome].tree!;
      // from above: a lob that comes down on the cone
      let above = 0;
      for (let along = 30; along <= 110; along += 4) {
        const run = through(treed(biome, along), 'sand-wedge', 1);
        if (run.calls.some(([c]) => c === 'knocked' || c === 'flickered')) above++;
      }
      expect(above, `${biome} lobbed onto`).toBeGreaterThan(0);
      // from under: a ball at rest close under the canopy, struck up into the underside
      let under = 0;
      for (const away of [2.5, 3.2, 4]) {
        for (const power of [0.4, 0.7, 1]) {
          const { game } = golfGame(treed(biome, 150));
          const tree = game.layout.trees[0];
          const from = { x: tree.x - away, y: tree.y };
          const run = through(treed(biome, 150), 'sand-wedge', power, from, 0);
          if (run.calls.some(([c]) => c === 'knocked' || c === 'flickered')) under++;
          void figures;
        }
      }
      expect(under, `${biome} struck up from under`).toBeGreaterThan(0);
    }
  });
});

describe('a cactus', () => {
  it('leaves a ball that met it resting near its foot', () => {
    let dropped = 0;
    for (let along = 40; along <= 240; along += 12) {
      const run = through(treed('desert', along), 'driver', 1);
      if (!run.calls.some(([c]) => c === 'knocked')) continue;
      const tree = run.game.layout.trees[0];
      const { world, ball } = run.game;
      const away = Math.hypot(world.x[ball] - tree.x, world.y[ball] - tree.y);
      if (away < 12) dropped++;
      // never at rest in the post or the cone
      expect(fromTrees(run.game.layout, world.x[ball], world.y[ball]) + 0.8).toBeGreaterThan(0.8 - 1e-9);
    }
    expect(dropped, 'balls dropped at its foot').toBeGreaterThan(0);
  });

  it('is smaller than a tree: the cone a ball meets is the cactus’s, not earth’s', () => {
    const { game } = golfGame(treed('desert', 150));
    expect(game.cones[0].radius).toBe(4);
    expect(game.cones[0].apex - game.cones[0].base).toBe(13);
    expect(golfGame(treed('earth', 150)).game.cones[0].radius).toBe(TREE.radius);
  });
});

describe('a hologram', () => {
  /** A drive through the middle of the canopy, told by what it did to the ball's speed. */
  function drive(seed = 1) {
    const def = treed('future', 150);
    const { game, calls } = golfGame(def, () => 0.5);
    void seed;
    game.pick('driver');
    expect(game.shoot(NORTH, 1)).toBe(true);
    const speeds: number[] = [];
    for (let f = 0; f < 60 * 20 && !game.ready; f++) {
      game.step(DT);
      speeds.push(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball], game.world.vz[game.ball]));
    }
    return { game, calls, speeds };
  }

  it('has no trunk body in the world, and the ball can be put down at its foot', () => {
    const { game } = golfGame(treed('future', 150));
    const tree = game.layout.trees[0];
    expect(game.world.bumpers.some((b) => Math.hypot(b.x - tree.x, b.y - tree.y) < 1)).toBe(false);
    expect(fromTrees(game.layout, tree.x, tree.y)).toBe(Infinity);
    expect(() => game.place(tree.x, tree.y)).not.toThrow();
    const earth = golfGame(treed('earth', 150)).game;
    expect(
      earth.world.bumpers.some((b) => Math.hypot(b.x - earth.layout.trees[0].x, b.y - earth.layout.trees[0].y) < 1),
    ).toBe(true);
  });

  it('keeps a ball going at half its speed, told once, never turned', () => {
    // a drive into the middle of the canopy at the height it flies at: found by trying the distances
    let found = false;
    for (let along = 60; along <= 230 && !found; along += 2) {
      const { game, calls } = golfGame(treed('future', along));
      game.pick('driver');
      game.shoot(NORTH, 1);
      let before = 0,
        after = 0,
        at = -1,
        knockedAtPassage = -1;
      const speeds: number[] = [];
      for (let f = 0; f < 60 * 20 && !game.ready; f++) {
        game.step(DT);
        speeds.push(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball], game.world.vz[game.ball]));
        if (at < 0 && calls.some(([c]) => c === 'flickered')) {
          at = f;
          knockedAtPassage = calls.filter(([c]) => c === 'knocked').length;
          before = speeds[f - 1];
          after = speeds[f];
        }
      }
      if (at < 0) continue;
      found = true;
      expect(calls.filter(([c]) => c === 'flickered').length, 'told once').toBe(1);
      expect(after / before, 'half its speed, give or take a step of gravity').toBeGreaterThan(0.45);
      expect(after / before).toBeLessThan(0.55);
      // not turned: it goes on north, x unchanged but for the scatter's nought
      expect(Math.abs(game.world.x[game.ball] - game.layout.trees[0].x)).toBeLessThan(1);
      expect(game.world.y[game.ball]).toBeGreaterThan(game.layout.trees[0].y - 1);
      expect(knockedAtPassage, 'not knocked down by it').toBe(0);
    }
    expect(found, 'a drive met the canopy').toBe(true);
  });

  it('comes to rest under the canopy where it can be struck, and the next shot starting inside one is not slowed again', () => {
    const { game, calls } = golfGame(treed('future', 150));
    const tree = game.layout.trees[0];
    const { world, ball } = game;
    // the ball put inside the cone, going up and out: it has not entered, it is in
    const cone = game.cones[0];
    const mid = (cone.base + cone.apex) / 2;
    world.wake(ball);
    world.x[ball] = tree.x + 1;
    world.y[ball] = tree.y;
    world.z[ball] = mid;
    world.vx[ball] = 0;
    world.vy[ball] = 30;
    world.vz[ball] = 0;
    expect(insideCanopy(cone, [world.x[ball], world.y[ball], world.z[ball]], world.r[ball])).toBeGreaterThan(0);
    const speed = Math.hypot(world.vy[ball]);
    (game as unknown as { moving: boolean }).moving = true;
    game.step(DT);
    expect(
      calls.some(([c]) => c === 'flickered'),
      'not told of a passage it was already in',
    ).toBe(false);
    expect(Math.hypot(world.vx[ball], world.vy[ball])).toBeGreaterThan(speed * 0.9);
    // and a ball that rests under it can be struck
    const under = golfGame(treed('future', 150)).game;
    under.place(tree.x, tree.y - 1);
    expect(under.ready).toBe(true);
    under.pick('7-iron');
    expect(under.shoot(NORTH, 0.6)).toBe(true);
  });

  it('plays the same passage from the same seed', () => {
    const a = drive();
    const b = drive();
    expect(a.speeds).toEqual(b.speeds);
    expect(a.calls.map(([c]) => c)).toEqual(b.calls.map(([c]) => c));
  });

  it('is run by the preview as the flight is, slowed, with no event told to the page', () => {
    // told to the rehearsal's own events and never to the game's
    const { game, calls } = golfGame(treed('future', 120));
    const before = calls.length;
    const rehearsal = game.rehearsal();
    rehearsal.trial(game.world.x[game.ball], game.world.y[game.ball]);
    rehearsal.pick('driver');
    rehearsal.shoot(NORTH, 1);
    for (let f = 0; f < 600 && !rehearsal.ready; f++) rehearsal.step(DT);
    expect(calls.length, 'nothing told to the game’s page').toBe(before);
    // the flight the rehearsal made is the flight the game makes
    game.pick('driver');
    game.shoot(NORTH, 1);
    for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
    expect(Math.abs(rehearsal.world.y[rehearsal.ball] - game.world.y[game.ball])).toBeLessThan(0.01);
  });
});

describe('the rules for a tree', () => {
  it('name a tree on a hole in a biome that has none', () => {
    const { game } = golfGame(levelHole({ name: 'bare', par: 3, length: 150, biome: 'moon' }));
    expect(checkInvariants(game)).toEqual([]);
    game.layout.trees.push({ x: 0, y: 0 });
    expect(checkInvariants(game).join('\n')).toMatch(/tree/);
  });

  it('name a body standing at a hologram’s foot, and a trunk missing at a cactus’s', () => {
    const holo = golfGame(treed('future', 150)).game;
    const tree = holo.layout.trees[0];
    expect(checkInvariants(holo)).toEqual([]);
    holo.world.bumpers.push({ x: tree.x, y: tree.y, radius: 0.9, top: 5, restitution: 0.3 });
    expect(checkInvariants(holo).join('\n')).toMatch(/hologram|trunk/);
    const cactus = golfGame(treed('desert', 150)).game;
    cactus.world.bumpers.length = 0;
    expect(checkInvariants(cactus).join('\n')).toMatch(/trunk|post/);
  });

  it('name a ball inside a cactus’s post or cone, and excuse one inside a hologram’s canopy', () => {
    for (const [biome, flagged] of [
      ['desert', true],
      ['future', false],
    ] as const) {
      const { game } = golfGame(treed(biome, 150));
      const cone = game.cones[0];
      const { world, ball } = game;
      world.wake(ball);
      world.x[ball] = cone.x + 0.5;
      world.y[ball] = cone.y;
      world.z[ball] = heightAt(game.layout, cone.x, cone.y) + (cone.base + cone.apex) / 2 - cone.base / 2 - 0;
      world.z[ball] = (cone.base + cone.apex) / 2;
      expect(
        checkInvariants(game).some((m) => /tree|canopy|cactus/.test(m)),
        biome,
      ).toBe(flagged);
    }
  });
});
