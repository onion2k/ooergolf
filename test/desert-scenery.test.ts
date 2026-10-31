/**
 * The desert in the picture, past the cactus and the pan: what stands round a hole of it (cacti thinner than earth's woods, scrub
 * and rock, mesas in place of the far woods), the models that it draws them with held to their budgets as the scene bakes them, the
 * tumbleweeds that roll over it by game time alone and the scenery swapped both ways as one hole follows another.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { BUDGET, bounds } from '../src/models';
import { Scene } from '../src/scene';
import { DRESSED, FAR, beyond, farWoods } from '../src/scenery';
import { sceneryOf } from '../src/sceneryset';
import { DRIFT, tumbleweedAt } from '../src/drift';
import { THEMES } from '../src/theme';
import { windOf } from '../src/turf';
import { BUCKETS } from '../src/models/tone';
import { golfGame } from './helpers';

const made = (biome?: 'desert') => {
  const def = golfHole({ ...LINKS_SPECS[2], name: `Scenery ${biome ?? 'earth'}`, ...(biome ? { biome } : {}) });
  return { def, layout: layoutOf(def.map, def.terrain, def.way, def.biome) };
};

describe('what stands past a hole of the desert', () => {
  it('is a scatter of cacti, scrub and rock with far fewer of the tall things than earth has trees', () => {
    const d = made('desert'),
      e = made();
    // the same hole, the same name: only the biome differs, so the clumps' places are the biome's choice
    const name = 'Scenery';
    const dp = beyond(d.layout, name),
      ep = beyond(e.layout, name);
    expect(dp.length).toBeGreaterThan(30);
    expect(dp.length, 'fewer pieces').toBeLessThan(ep.length * 0.7);
    const tall = (ps: typeof dp) => ps.filter((p) => p.kind === 'conifer' || p.kind === 'broadleaf').length;
    expect(tall(dp), 'fewer cacti than earth has trees').toBeLessThan(tall(ep) * 0.4);
    // and more of the low things than of the tall
    expect(dp.filter((p) => p.kind === 'bush' || p.kind === 'fern' || p.kind === 'rock').length).toBeGreaterThan(
      tall(dp),
    );
  });

  it('keeps the clear ground of a hole’s edge as earth does: no piece within the margin of a tile a ball can be on', () => {
    const { layout } = made('desert');
    for (const p of beyond(layout, 'Scenery')) {
      const tx = Math.floor((p.x - layout.originX) / TILE),
        ty = Math.floor((p.y - layout.originY) / TILE);
      if (tx < 0 || ty < 0 || tx >= layout.cols || ty >= layout.rows) continue;
      expect(layout.solid[ty * layout.cols + tx], 'on rock, past the wall').toBe(1);
    }
  });

  it('has a few mesas in place of far woods, the same few for a hole every time, and none of the barrel cactus’s great size', () => {
    const { layout } = made('desert');
    const far = farWoods(layout, 'Scenery');
    expect(far.length).toBeGreaterThan(20);
    expect(far.length).toBeLessThanOrEqual(DRESSED.desert.far.most);
    expect(far.length, 'a tenth of the woods').toBeLessThan(FAR.most / 5);
    expect(farWoods(layout, 'Scenery')).toEqual(far);
    for (const p of beyond(layout, 'Scenery').filter((q) => q.kind === 'broadleaf'))
      expect(p.scale, 'a barrel is not made greater by the woods’ rule').toBeLessThanOrEqual(0.8 + 0.45 + 1e-9);
  });

  it('is earth’s own when the biome is earth: the same pieces as before there was a table', () => {
    const e = made();
    expect(DRESSED.earth.far).toEqual({
      most: FAR.most,
      per: 55,
      clump: FAR.clump,
      size: FAR.size,
      scale: FAR.scale,
      spread: FAR.spread,
    });
    expect(beyond(e.layout, 'Scenery').length).toBeGreaterThan(300);
  });
});

describe('the desert’s models as the scene bakes them', () => {
  const set = sceneryOf(THEMES.desert);
  const tris = (ms: { parts: { mesh: { indices: ArrayLike<number> } }[] }[]) =>
    Math.max(...ms.map((m) => m.parts.reduce((a, p) => a + p.mesh.indices.length / 3, 0)));

  it('has a model for every kind a biome has a slot for, in each turn of the light', () => {
    for (const kind of ['broadleaf', 'conifer', 'bush', 'fern', 'rock'] as const) {
      expect(set.scatter[kind], `scatter ${kind}`).toHaveLength(BUCKETS);
      expect(set.beyond[kind], `beyond ${kind}`).toHaveLength(BUCKETS);
    }
    expect(set.far.conifer).toHaveLength(BUCKETS);
    expect(set.far.broadleaf).toHaveLength(BUCKETS);
    expect(set.golfTree).toHaveLength(1);
    expect(set.drift).toHaveLength(1);
    expect(set.hills).toBeGreaterThan(1);
  });

  it('keeps each to its budget, toned (tiers are faces sorted and never made)', () => {
    expect(tris(set.beyond.conifer!)).toBeLessThanOrEqual(BUDGET.saguaro);
    expect(tris(set.beyond.broadleaf!)).toBeLessThanOrEqual(BUDGET.barrel);
    expect(tris(set.beyond.bush!)).toBeLessThanOrEqual(BUDGET.scrub);
    expect(tris(set.beyond.fern!)).toBeLessThanOrEqual(BUDGET.tuft);
    expect(tris(set.far.conifer!)).toBeLessThanOrEqual(BUDGET.mesa);
    expect(tris(set.far.broadleaf!)).toBeLessThanOrEqual(BUDGET.mesa);
    expect(tris(set.golfTree!)).toBeLessThanOrEqual(BUDGET.golfCactus);
    expect(tris(set.drift!)).toBeLessThanOrEqual(BUDGET.tumbleweed);
  });

  it('draws the golf cactus to the physics’ own figures: as tall as they say', () => {
    const b = bounds(set.golfTree![0].parts);
    expect(b.max[2]).toBeGreaterThan(14.9);
    expect(b.max[2]).toBeLessThanOrEqual(15 + 1e-6);
  });
});

describe('tumbleweeds on a hole of the desert', () => {
  const play = (biome?: 'desert') => {
    const def = golfHole({ ...LINKS_SPECS[1], name: 'Weeds', ...(biome ? { biome } : {}) });
    return golfGame(def).game;
  };
  const drawn = (biome?: 'desert') => {
    const game = play(biome);
    const scene = new Scene();
    scene.static(game.layout, 'Weeds', game.obstacles, game.cup.radius);
    const wind = windOf('Weeds');
    const moving = scene.dynamic(game.obstacles, game.layout, 'Weeds', wind, {});
    return { game, scene, moving, wind };
  };
  const weed = () => sceneryOf(THEMES.desert).drift![0].parts[0].mesh;

  it('are a fixed few on a desert hole, drawn and moved, and none on earth', () => {
    const d = drawn('desert');
    const groups = d.moving.filter((g) => g.mesh === weed());
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(DRIFT.count);
    expect(drawn().moving.filter((g) => g.mesh === weed())).toHaveLength(0);
  });

  it('are where game time puts them: the same at the same time in another scene, moved on as time goes, and never a function of anything else', () => {
    const a = drawn('desert'),
      b = drawn('desert');
    const at = (x: ReturnType<typeof drawn>, t: number) => {
      x.scene.writeMoving(t);
      return Array.from(x.moving.find((g) => g.mesh === weed())!.matrices);
    };
    const first = at(a, 3);
    expect(at(b, 3), 'the same time, the same places').toEqual(first);
    expect(at(a, 9), 'and later, elsewhere').not.toEqual(first);
    expect(at(a, 3), 'and back to that time, back to those places').toEqual(first);
    // and the places are `drift.ts`'s, up to the ground they stand on
    const w = tumbleweedAt(a.game.layout, 'Weeds', 0, 3, [a.wind.direction[0], a.wind.direction[1]]);
    expect(first[12]).toBeCloseTo(w.x, 3);
    expect(first[13]).toBeCloseTo(w.y, 3);
    // standing on the ground: above it by about their radius, never under or in the sky
    for (let k = 0; k < DRIFT.count; k++) {
      expect(Number.isFinite(first[k * 16 + 14])).toBe(true);
      expect(first[k * 16 + 14]).toBeGreaterThan(-20);
      expect(first[k * 16 + 14]).toBeLessThan(40);
    }
  });

  it('are gone with the hole: a hole of earth drawn after has none, and a desert hole drawn again has them again', () => {
    const scene = new Scene();
    const d = play('desert'),
      e = play();
    const draw = (game: typeof d) => {
      scene.static(game.layout, 'Weeds', game.obstacles, game.cup.radius);
      return scene.dynamic(game.obstacles, game.layout, 'Weeds', windOf('Weeds'), {});
    };
    expect(draw(d).filter((g) => g.mesh === weed())).toHaveLength(1);
    expect(draw(e).filter((g) => g.mesh === weed())).toHaveLength(0);
    expect(draw(d).filter((g) => g.mesh === weed())).toHaveLength(1);
  });

  it('take no body in the game: the hole the weeds are drawn on is the hole it was, bodies and all', () => {
    const d = play('desert');
    // (a tumbleweed is a matrix and not a body of the physics: the layout names none)
    expect(Object.keys(d.layout).some((k) => /weed|drift/i.test(k))).toBe(false);
  });
});

describe('the scenery swapped both ways, hole after hole', () => {
  it('draws a desert hole’s set after earth’s and earth’s after the desert’s, each its own models', () => {
    const scene = new Scene();
    const d = golfGame(golfHole({ ...LINKS_SPECS[1], name: 'Swap', biome: 'desert' })).game;
    const e = golfGame(golfHole({ ...LINKS_SPECS[1], name: 'Swap' })).game;
    const draw = (game: typeof d) => scene.static(game.layout, 'Swap', game.obstacles, game.cup.radius);
    const earthTree = sceneryOf(THEMES.earth).golfTree![0].parts[0].mesh,
      cactus = sceneryOf(THEMES.desert).golfTree![0].parts[0].mesh;
    const uses = (groups: ReturnType<typeof draw>, mesh: unknown) => groups.some((g) => g.mesh === mesh);
    const first = draw(d);
    expect(uses(first, cactus) || d.layout.trees.length === 0).toBe(true);
    expect(uses(first, earthTree), 'no oak on a desert hole').toBe(false);
    const second = draw(e);
    expect(uses(second, cactus), 'no cactus on an earth hole').toBe(false);
    expect(uses(second, earthTree) || e.layout.trees.length === 0).toBe(true);
    expect(uses(draw(d), cactus) || d.layout.trees.length === 0).toBe(true);
  });
});
