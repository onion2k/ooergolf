/**
 * The Future in the picture: holograms that flicker from game time alone (a function of the hole's name, the tree and the time, the
 * same every run and nothing made as it goes), flare where a ball has gone through, and are drawn from four pools by the level of
 * their glow; its scenery (pylons and bollards past the hole, a skyline of towers far off, no bunting); its quicksilver (a chrome
 * kerb and no stones, a ring where a ball goes in, silver for droplets); the glowing cup; and its sparks.
 */
import { describe, expect, it, vi } from 'vitest';
import { STILL } from 'artshape-render/game/grass';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { layoutOf } from '../src/arena';
import { strikePuff, splash } from '../src/bursts';
import { FLARE, FLICKER, LEVELS, levelAt, seedOf } from '../src/flicker';
import { Scene } from '../src/scene';
import { DRESSED, dress, farWoods } from '../src/scenery';
import { sceneryOf } from '../src/sceneryset';
import { THEMES } from '../src/theme';
import { pondOf } from '../src/waterdraw';
import { golfGame } from './helpers';

const seed = seedOf('Flicker test');

describe('a hologram’s flicker', () => {
  it('is a function of the hole, the tree and the time alone: the same each time it is asked, in any order', () => {
    const at = (k: number, t: number) => levelAt(seed, k, t, -1);
    const first = Array.from({ length: 40 }, (_, k) => [0, 0.3, 4.1, 99.9, 3600].map((t) => at(k, t)));
    // asked again, in another order, with other things asked between
    const again = Array.from({ length: 40 }, (_, i) => {
      const k = 39 - i;
      at(k + 1, 5);
      return [3600, 99.9, 4.1, 0.3, 0].map((t) => at(k, t)).reverse();
    }).reverse();
    expect(again).toEqual(first);
    // another hole's flicker is another: over every tree and a few seconds the two do not agree everywhere
    const other = seedOf('another');
    let apart = 0;
    for (let k = 0; k < 60; k++)
      for (let t = 0; t < 30; t += 0.1) if (levelAt(other, k, t, -1) !== levelAt(seed, k, t, -1)) apart++;
    expect(apart).toBeGreaterThan(20);
  });

  it('does not read the wall clock: the same at a frozen time and a moved one', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const a = Array.from({ length: 200 }, (_, k) => levelAt(seed, k, k * 0.37, -1));
      vi.setSystemTime(new Date('2031-06-01T12:34:56Z'));
      vi.advanceTimersByTime(123456);
      const b = Array.from({ length: 200 }, (_, k) => levelAt(seed, k, k * 0.37, -1));
      expect(b).toEqual(a);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is lit most of the time and dips now and then, dimmer or nearly out, each tree on its own beat, about as often as its figures say', () => {
    let lit = 0,
      dim = 0,
      out = 0;
    const n = 100,
      steps = 300;
    for (let k = 0; k < n; k++)
      for (let s = 0; s < steps; s++) {
        const level = levelAt(seed, k, s / FLICKER.rate, -1);
        if (level === LEVELS.lit) lit++;
        else if (level === LEVELS.dim) dim++;
        else if (level === LEVELS.out) out++;
        else throw new Error('flared with no ball through it');
      }
    const total = n * steps;
    expect(lit / total).toBeGreaterThan(0.85);
    expect(dim / total).toBeGreaterThan(FLICKER.dim * 0.5);
    expect(dim / total).toBeLessThan(FLICKER.dim * 1.6);
    expect(out / total).toBeGreaterThan(0);
    expect(out / total).toBeLessThan(FLICKER.out * 2.5);
    // they do not dip together
    let together = 0;
    for (let s = 0; s < steps; s++) {
      const t = s / FLICKER.rate;
      if (Array.from({ length: n }, (_, k) => levelAt(seed, k, t, -1)).filter((l) => l !== LEVELS.lit).length > n / 3)
        together++;
    }
    expect(together).toBe(0);
  });

  it('flares for a moment where a ball has gone through, whatever its flicker would be, and then goes back to it', () => {
    for (let k = 0; k < 30; k++) {
      expect(levelAt(seed, k, 12.3, 0)).toBe(LEVELS.flare);
      expect(levelAt(seed, k, 12.3, FLARE.lasts * 0.99)).toBe(LEVELS.flare);
      expect(levelAt(seed, k, 12.3, FLARE.lasts)).toBe(levelAt(seed, k, 12.3, -1));
    }
  });

  it('makes nothing as it goes: a million asks leave the heap where it was', () => {
    const heap = () => {
      (globalThis as { gc?: () => void }).gc?.();
      return process.memoryUsage().heapUsed;
    };
    let sink = 0;
    for (let i = 0; i < 20000; i++) sink += levelAt(seed, i % 160, i * 0.016, -1);
    const before = heap();
    for (let i = 0; i < 1_000_000; i++) sink += levelAt(seed, i % 160, i * 0.016, i % 7 === 0 ? 0.2 : -1);
    expect(heap() - before, `sink ${sink}`).toBeLessThan(8_000_000);
  });
});

/** A Water Carry of the Future, with the trees the hole gives it. */
function future(name = 'Future test') {
  const def = golfHole({ ...LINKS_SPECS[1], name, biome: 'future' });
  return golfGame(def).game;
}

describe('a hole of the Future, drawn', () => {
  it('draws its trees from four pools, one for each level of glow, every tree in exactly one at any time, and none still', () => {
    const game = future();
    const trees = game.layout.trees.length;
    expect(trees).toBeGreaterThan(10);
    const scene = new Scene();
    const still = scene.static(game.layout, 'Future test', game.obstacles, game.cup.radius);
    const levels = sceneryOf(THEMES.future).golfLevels!;
    expect(levels).toHaveLength(4);
    // none of them is in the still part, which would hold them at one glow
    const meshes = new Set(levels.flatMap((m) => m.parts.map((p) => p.mesh)));
    expect(still.some((g) => meshes.has(g.mesh as never))).toBe(false);
    const moving = scene.dynamic(game.obstacles, game.layout, 'Future test', STILL, {});
    for (const t of [0, 0.4, 7.7, 31.2]) {
      const entries = scene.writeMoving(t);
      // the pool of each level, counted once, by the part that draws the first of the level's parts
      const counts = levels.map((m) => {
        const g = moving.find((x) => x.mesh === m.parts[0].mesh)!;
        return entries.find((e) => e.matrices === g.matrices)!.count;
      });
      expect(
        counts.reduce((a, b) => a + b, 0),
        `at ${t}`,
      ).toBe(trees);
      expect(counts[LEVELS.flare], 'none flared with no ball through').toBe(0);
      expect(counts[LEVELS.lit], 'most are lit').toBeGreaterThan(trees * 0.7);
    }
  });

  it('flares the tree a ball went through, and only it, for a moment, then back', () => {
    const game = future();
    const scene = new Scene();
    scene.static(game.layout, 'Future test', game.obstacles, game.cup.radius);
    const moving = scene.dynamic(game.obstacles, game.layout, 'Future test', STILL, {});
    const levels = sceneryOf(THEMES.future).golfLevels!;
    const flared = (t: number) => {
      const entries = scene.writeMoving(t);
      const g = moving.find((x) => x.mesh === levels[LEVELS.flare].parts[0].mesh)!;
      return entries.find((e) => e.matrices === g.matrices)!.count;
    };
    expect(flared(5)).toBe(0);
    const tree = game.layout.trees[3];
    expect(scene.flaredAt(tree.x + 1, tree.y - 1, 5)).toBe(3);
    expect(flared(5.01)).toBe(1);
    expect(flared(5 + FLARE.lasts * 0.9)).toBe(1);
    expect(flared(5 + FLARE.lasts + 0.01)).toBe(0);
  });

  it('is one hologram’s same picture at the same game time in two scenes: the pools are filled from time alone', () => {
    const game = future();
    const fill = () => {
      const scene = new Scene();
      scene.static(game.layout, 'Future test', game.obstacles, game.cup.radius);
      scene.dynamic(game.obstacles, game.layout, 'Future test', STILL, {});
      return scene
        .writeMoving(9.3)
        .map((e) => [e.count, Array.from(e.matrices.subarray(0, 16 * Math.min(e.count, 3)))]);
    };
    expect(fill()).toEqual(fill());
  });

  it('has a cup with a ring of light, and no bunting, and no stones round its water, whose kerb is chrome', () => {
    const game = future();
    const scene = new Scene();
    const still = scene.static(game.layout, 'Future test', game.obstacles, game.cup.radius);
    expect(THEMES.future.cupGlow).toBe(true);
    expect(
      still.some((g) => g.patterns && g.patterns[0] === 10),
      'a glowing group on the hole',
    ).toBe(true);
    expect(dress(game.layout, 'Future test').bunting).toEqual([]);
    const pond = pondOf(game.layout);
    expect(pond.spots, 'no stones').toEqual([]);
    const kerb = pond.parts.find((p) => p.name === 'shelf');
    if (kerb) expect(kerb.material[3], 'chrome, not rock').toBeLessThan(0.3);
    expect(THEMES.future.water.mirror).toBe(true);
    expect(THEMES.earth.water.mirror).toBe(false);
  });

  it('keeps the near ground from being a wall of light and the skyline far from the hole', () => {
    const def = golfHole({ ...LINKS_SPECS[2], name: 'Skyline', biome: 'future' });
    const layout = layoutOf(def.map, def.terrain, def.way, def.biome);
    const earthDef = golfHole({ ...LINKS_SPECS[2], name: 'Skyline' });
    const e = layoutOf(earthDef.map, earthDef.terrain, earthDef.way);
    expect(DRESSED.future.bunting).toBe(false);
    expect(DRESSED.future.far.from).toBeGreaterThanOrEqual(250);
    const far = farWoods(layout, 'Skyline');
    expect(far.length).toBeGreaterThan(5);
    expect(far.length).toBeLessThan(farWoods(e, 'Skyline').length / 3);
    for (const p of far) {
      const d = Math.max(
        layout.originX - p.x,
        p.x - (layout.originX + layout.cols * 3),
        layout.originY - p.y,
        p.y - (layout.originY + layout.rows * 3),
      );
      expect(d, 'a tower never stands near the hole').toBeGreaterThan(
        DRESSED.future.far.from - DRESSED.future.far.clump,
      );
    }
  });

  it('throws sparks off a plate and silver where a ball goes into quicksilver', () => {
    const p = THEMES.future.puff;
    const e = strikePuff(0, 0, 0.6)[0],
      f = strikePuff(0, 0, 0.6, 'grass', p)[0];
    expect(f.colour[2], 'cyan, not grass').toBeGreaterThan(f.colour[0]);
    expect(f.life).toBeLessThan(e.life);
    expect(f.gravity!).toBeLessThan(e.gravity!);
    const silver = splash(1, 2, p.splash)[0];
    expect(Math.min(...silver.colour)).toBeGreaterThan(0.85);
    expect(splash(1, 2)[0].colour).toEqual([0.75, 0.9, 1]);
  });
});
