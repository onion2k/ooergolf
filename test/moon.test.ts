/**
 * The Moon in the picture: its sky (stars and an Earth, which only a view that sees the sky draws, from the hole's name by a hash and
 * never by chance), its crater (a bowl drawn on the water's tiles with a pale rim only outside them), its flag held out on a wire,
 * its dust, its lack of trees, wind, bunting and lake past the hills, and its slow clock (a ball rolls by the world's seconds).
 */
import { describe, expect, it } from 'vitest';
import { PATTERN_STRIDE } from 'artshape-render/game/renderer';
import { STILL } from 'artshape-render/game/grass';
import { WATER_LEVEL, layoutOf, tileAt } from '../src/arena';
import { BIOMES } from '../src/biome';
import { backdropOf } from '../src/backdrop';
import { craterDust, strikePuff } from '../src/bursts';
import { golfHole } from '../src/golf';
import { craterRimsOf } from '../src/ground';
import { groundZOf } from '../src/hills';
import { LINKS_SPECS } from '../src/links';
import { BUDGET, bounds, flag, triangles } from '../src/models';
import { earth, stars } from '../src/models/moon';
import { Scene } from '../src/scene';
import { DRESSED, dress } from '../src/scenery';
import { SKY, earthAt, starAt, starsOf } from '../src/stars';
import { flagTurn } from '../src/sway';
import { THEMES } from '../src/theme';
import { windOf } from '../src/turf';
import { CRATER, pondOf } from '../src/waterdraw';
import { golfGame, levelHole } from './helpers';

const hole = (biome?: 'moon', name = 'Moon test') => {
  const def = golfHole({ ...LINKS_SPECS[1], name, ...(biome ? { biome, trees: 0 } : {}) });
  return { def, layout: layoutOf(def.map, def.terrain, def.way, def.biome) };
};

describe('the Moon’s sky', () => {
  it('is a function of the hole’s name alone: the same stars and Earth every time, other for another name', () => {
    expect(starsOf('a')).toEqual(starsOf('a'));
    expect(starAt('a', 5)).toEqual(starsOf('a')[5]);
    expect(starsOf('a')).not.toEqual(starsOf('b'));
    expect(starsOf('a')).toHaveLength(SKY.stars);
    expect(earthAt('a', 1)).toEqual(earthAt('a', 1));
    expect(earthAt('a', 1).azimuth).not.toBeCloseTo(earthAt('b', 1).azimuth, 3);
    // the Earth is in the way the fly-in looks, within half a radian of the hole’s heading, and low over the hills
    expect(Math.abs(earthAt('a', 1).azimuth - 1)).toBeLessThan(0.5);
    expect(earthAt('a', 1).rise).toBe(SKY.earth.rise);
    // and the same mesh, vertex for vertex
    expect(Array.from(stars('a').parts[0].mesh.positions)).toEqual(Array.from(stars('a').parts[0].mesh.positions));
  });

  it('has every star above the horizon and on the dome, and the sky within its budgets', () => {
    for (const s of starsOf('Water Carry')) {
      expect(s.rise).toBeGreaterThan(0);
      expect(s.rise).toBeLessThan(Math.PI / 2);
      expect(s.brightness).toBeGreaterThan(0);
      expect(s.brightness).toBeLessThanOrEqual(1);
    }
    const sky = stars('Water Carry');
    for (let i = 0; i < sky.parts[0].mesh.positions.length; i += 3) {
      const [x, y, z] = [
        sky.parts[0].mesh.positions[i],
        sky.parts[0].mesh.positions[i + 1],
        sky.parts[0].mesh.positions[i + 2],
      ];
      expect(z).toBeGreaterThan(0);
      expect(Math.hypot(x, y, z)).toBeGreaterThan(SKY.dome - 20);
      expect(Math.hypot(x, y, z)).toBeLessThan(SKY.dome + 20);
    }
    expect(triangles(sky)).toBe(SKY.stars * 2);
    expect(triangles(sky)).toBeLessThanOrEqual(BUDGET.stars);
    expect(triangles(earth('Water Carry', 0))).toBeLessThanOrEqual(BUDGET.earth);
    const b = bounds(earth('Water Carry', 0).parts);
    expect(b.max[2]).toBeGreaterThan(0);
  });

  it('is drawn to a view that sees the sky and to no other: stars and the Earth are the fly-in’s only', () => {
    const { game } = golfGame(levelHole({ name: 'sky', par: 3, length: 150, biome: 'moon' }));
    const scene = new Scene();
    scene.static(game.layout, 'sky', game.obstacles, game.cup.radius);
    scene.dynamic(game.obstacles, game.layout, 'sky', STILL, {});
    scene.setSky(false);
    scene.writeMoving(1);
    expect(scene.skyDrawn(), 'a play view sees none of it').toBe(0);
    scene.setSky(true);
    scene.writeMoving(1);
    // the stars and the Earth, one mesh each (and no cloud: the Moon has none)
    expect(scene.skyDrawn()).toBe(2);
    scene.setSky(false);
    scene.writeMoving(2);
    expect(scene.skyDrawn()).toBe(0);
    // and earth has clouds and neither
    const e = golfGame(levelHole({ name: 'sky', par: 3, length: 150 })).game;
    const earthScene = new Scene();
    earthScene.static(e.layout, 'sky', e.obstacles, e.cup.radius);
    earthScene.dynamic(e.obstacles, e.layout, 'sky', windOf('sky'), {});
    earthScene.setSky(true);
    earthScene.writeMoving(1);
    expect(earthScene.skyDrawn(), 'earth’s clouds, and no stars').toBeGreaterThan(5);
  });
});

describe('the Moon’s crater', () => {
  const { layout } = hole('moon');

  it('is drawn on the water’s tiles and nowhere else, a bowl going down from the rim to a deep pit, matte and with no wave in it', () => {
    const { parts } = pondOf(layout);
    expect(parts.length).toBeGreaterThan(2);
    let lowest = Infinity,
      highest = -Infinity;
    for (const part of parts) {
      if (part.name === 'shelf') continue;
      const p = part.mesh.positions;
      for (let k = 0; k < part.mesh.indices.length; k += 3) {
        const [a, b, c] = [part.mesh.indices[k] * 3, part.mesh.indices[k + 1] * 3, part.mesh.indices[k + 2] * 3];
        const x = layout.originX + (p[a] + p[b] + p[c]) / 3,
          y = layout.originY + (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
        const t = tileAt(layout, x, y);
        expect(t >= 0 && layout.water[t] === 1, `${part.name}: a triangle off the water`).toBe(true);
      }
      for (let i = 2; i < p.length; i += 3) {
        lowest = Math.min(lowest, p[i]);
        highest = Math.max(highest, p[i]);
      }
    }
    // from the water's level at the rim down to the pit's floor
    expect(highest).toBeLessThanOrEqual(WATER_LEVEL + 1e-6);
    expect(lowest).toBeCloseTo(WATER_LEVEL - CRATER.drop, 5);
    const deep = parts.find((q) => q.name === 'deep')!;
    expect(deep.pattern, 'no wave in the pit').toBeUndefined();
    // the bands go down dark: each darker than the one out from it
    const light = (c: readonly number[]) => c[0] + c[1] + c[2];
    const bands = parts.filter((q) => q.name !== 'shelf');
    for (let k = 1; k < bands.length; k++)
      expect(light(bands[k].material)).toBeLessThanOrEqual(light(bands[k - 1].material));
  });

  it('is water to the game and earth’s water is as it was, flat and with its waves', () => {
    expect(BIOMES.moon.hazard).toBe('crater');
    const e = hole().layout;
    const parts = pondOf(e).parts;
    for (const part of parts)
      if (part.name !== 'shelf')
        for (let i = 2; i < part.mesh.positions.length; i += 3)
          expect(part.mesh.positions[i]).toBeCloseTo(WATER_LEVEL, 6);
    expect(parts.find((q) => q.name === 'deep')!.pattern).toBeDefined();
  });

  it('has a rim of ejecta on the ground outside the water’s tiles only, in two ribbons, the pale one raised and the soft one falling to the dust', () => {
    const { pale, soft } = craterRimsOf(layout);
    expect(pale.indices.length / 3).toBeGreaterThan(100);
    expect(soft.indices.length / 3).toBeGreaterThan(100);
    for (const mesh of [pale, soft])
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const t = tileAt(layout, mesh.positions[i], mesh.positions[i + 1]);
        expect(t >= 0, 'on the map').toBe(true);
        expect(layout.water[t], 'on no water tile').toBe(0);
      }
    for (let i = 0; i < pale.normals.length; i += 3) expect(pale.normals[i + 2]).toBeGreaterThan(0.3);
    // the pale ribbon stands up off the ground at the curve, the soft one lower
    const high = (m: typeof pale) =>
      Math.max(...Array.from({ length: m.positions.length / 3 }, (_, k) => m.positions[k * 3 + 2]));
    expect(high(pale)).toBeGreaterThan(high(soft) - 1);
    // none on a hole with no water
    const dry = layoutOf(levelHole({ name: 'dry', par: 3, length: 150, biome: 'moon' }).map);
    expect(craterRimsOf(dry).pale.indices.length).toBe(0);
  });

  it('puts up dust and not a splash where a ball goes in: slow, grey and falling back into the pit', () => {
    const d = craterDust(3, 4, THEMES.moon.puff.grass, CRATER.drop);
    expect(d[0].position).toEqual([3, 4, WATER_LEVEL - CRATER.drop]);
    expect(d[0].gravity).toBeLessThan(0.5);
    expect(d[0].colour[2], 'grey, not water’s blue').toBeLessThan(0.8);
    expect(Math.abs(d[0].colour[0] - d[0].colour[2])).toBeLessThan(0.1);
  });
});

describe('the Moon’s scatter and its world past the hole', () => {
  const { layout } = hole('moon');
  it('has no tree, no bunting and no woods: boulders and small rocks only, sparse', () => {
    expect(THEMES.moon.scenery.golfTree).toBeNull();
    expect(THEMES.moon.scenery.scatter.broadleaf).toBeNull();
    expect(THEMES.moon.scenery.beyond.conifer).toBeNull();
    expect(THEMES.moon.scenery.far.conifer).toBeNull();
    expect(DRESSED.moon.wood).toEqual([]);
    expect(DRESSED.moon.bunting).toBe(false);
    expect(dress(layout, 'Moon test').bunting, 'nothing hangs in air').toEqual([]);
    expect(dress(hole().layout, 'Moon test').bunting.length, 'earth has its bunting').toBeGreaterThan(0);
  });

  it('has hills lower than earth’s, no lake and no hollow for one, and no clouds', () => {
    expect(THEMES.moon.backdrop.relief).toBeLessThan(1);
    expect(THEMES.moon.backdrop.lake).toBe(false);
    expect(THEMES.moon.backdrop.clouds).toBe(false);
    const ground = groundZOf(layout, 'Moon test');
    expect(ground.lake!.weight(layout.originX + 400, layout.originY + 400)).toBe(0);
    const top = (l: typeof layout) => {
      const b = backdropOf(l, 'Moon test', -3).hills.positions;
      let m = -Infinity;
      for (let i = 2; i < b.length; i += 3) m = Math.max(m, b[i]);
      return m;
    };
    expect(top(layout)).toBeLessThan(top(hole().layout));
  });
});

describe('the Moon’s flag and its dust', () => {
  it('holds the cloth out on a wire: a pose that never changes with time on a calm hole, and moves on earth', () => {
    const w = windOf('a');
    for (const t of [0, 1.3, 7.7, 40]) expect(flagTurn(t, 5, 6, STILL, true)).toBe(flagTurn(0, 5, 6, STILL, true));
    expect(flagTurn(0, 5, 6, w)).not.toBe(flagTurn(1.3, 5, 6, w));
    const pose = (biome?: 'moon') => {
      const { game } = golfGame(levelHole({ name: 'flag', par: 3, length: 150, ...(biome ? { biome } : {}) }));
      const scene = new Scene();
      scene.static(game.layout, 'flag', game.obstacles, game.cup.radius);
      scene.dynamic(game.obstacles, game.layout, 'flag', biome ? STILL : windOf('flag'), {});
      const first = Array.from(scene.writeMoving(1.0)[0].matrices);
      const later = Array.from(scene.writeMoving(3.1)[0].matrices);
      return { first, later };
    };
    const moon = pose('moon');
    expect(moon.later, 'the moon’s flag does not move').toEqual(moon.first);
    const earth = pose();
    expect(earth.later).not.toEqual(earth.first);
  });

  it('has a wire along the flag’s top on the Moon, a part that turns with the cloth, and none on earth', () => {
    expect(flag([1, 0, 0], { rigid: true }).parts.some((p) => p.name === 'wire')).toBe(true);
    expect(flag([1, 0, 0]).parts.some((p) => p.name === 'wire')).toBe(false);
    expect(THEMES.moon.rigidFlag).toBe(true);
    expect(THEMES.earth.rigidFlag).toBe(false);
  });

  it('throws a plume of dust that rises and settles slowly, deeper than earth’s puff, in pale grey', () => {
    const e = strikePuff(0, 0, 0.6)[0],
      m = strikePuff(0, 0, 0.6, 'grass', THEMES.moon.puff)[0];
    expect(m.gravity!).toBeLessThan(e.gravity! / 3);
    expect(m.life).toBeGreaterThan(e.life * 2);
    expect(m.count).toBeGreaterThan(e.count);
    expect(m.velocity[2]).toBeGreaterThan(e.velocity[2]);
    expect(Math.abs(m.colour[0] - m.colour[2])).toBeLessThan(0.1);
    expect(m.colour[0]).toBeGreaterThan(0.6);
  });

  it('turns a ball by the world’s seconds, which a biome’s pace makes fewer than the clock’s', () => {
    const moon = golfGame(levelHole({ name: 'roll', par: 3, length: 150, biome: 'moon' })).game;
    const earth = golfGame(levelHole({ name: 'roll', par: 3, length: 150 })).game;
    expect(moon.worldSeconds(1)).toBeCloseTo(BIOMES.moon.pace, 9);
    expect(earth.worldSeconds(1)).toBe(1);
  });

  it('puts no flow on a group of the Moon but those it needs: the stars, and the Earth’s sea; no water’s waves, no ripple', () => {
    const { game } = golfGame(levelHole({ name: 'flows', par: 3, length: 150, biome: 'moon', pan: undefined }));
    const scene = new Scene();
    const still = scene.static(game.layout, 'flows', game.obstacles, game.cup.radius);
    const moving = scene.dynamic(game.obstacles, game.layout, 'flows', STILL, {});
    const kinds = new Set<number>();
    for (const g of [...still, ...moving])
      if (g.patterns) for (let o = 0; o < g.patterns.length; o += PATTERN_STRIDE) kinds.add(g.patterns[o]);
    // (the pole's bands are not a flow: a flow is a kind of five and up)
    for (const k of [...kinds]) if (k < 4.5) kinds.delete(k);
    expect(kinds.size, 'the stars and the Earth are there to glow').toBe(1);
    for (const k of kinds) expect(k, 'only the glow of stars and the Earth').toBe(10);
  });
});
