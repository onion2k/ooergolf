/**
 * The themes: what a hole looks like in its biome. Earth's is what the game was drawn in before there were biomes (the very
 * objects), every theme has every field and each colour is a colour, the look of one theme leaves nothing on the next, the
 * grass is made once for each and none for a biome with bare ground, and the game never imports the picture's theme.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BIOMES, type BiomeName } from '../src/biome';
import { HAZE, SKY, TOY, lookFor } from '../src/look';
import { OCEAN } from '../src/models/obstacles';
import { BANK_STONE } from '../src/models/lowpoly';
import { PALETTE as COLOURS } from '../src/models/palette';
import { BEYOND_MODELS, FAR_WOODS, GOLF_TREES, PALETTE, SCENERY_MODELS, Scene, paletteOf } from '../src/scene';
import { sceneryOf, setsKept } from '../src/sceneryset';
import { BUCKETS } from '../src/models/tone';
import { treeOf } from '../src/biome';
import { SUN } from '../src/sun';
import { BANK_TINT } from '../src/tint';
import { EARTH_GRASS, THEMES, themeOf } from '../src/theme';
import { KINDS, bladeless, fieldOf, flattenFor, golfKindsOf } from '../src/turf';
import { TURF_KINDS } from '../src/turfTexture';
import { BAND_COLOURS, SHELF } from '../src/waterdraw';
import { LOOKS } from '../smoke/biomes';
import { golfGame, levelHole } from './helpers';

const NAMES = Object.keys(BIOMES) as BiomeName[];

/** Every path through an object's keys, as a sorted list, for holding two to the same shape. */
function shape(v: unknown, path = ''): string[] {
  if (Array.isArray(v) || typeof v !== 'object' || v === null) return [path];
  return Object.entries(v)
    .flatMap(([k, x]) => shape(x, `${path}.${k}`))
    .sort();
}

describe('earth’s theme', () => {
  const earth = THEMES.earth;

  it('is what the game was drawn in: the very objects of the palette, the toy, the sky, the haze, the sun and the water', () => {
    for (const key of Object.keys(earth.ground).filter((k) => k !== 'bank'))
      expect(earth.ground[key as keyof typeof earth.ground], key).toBe(COLOURS[key as keyof typeof COLOURS]);
    expect(earth.look.sunDir).toBe(SUN);
    expect(earth.look.sky).toBe(SKY);
    expect(earth.look.background).toBe(SKY.horizon);
    expect(earth.look.shadeColour).toBe(TOY.shadeColour);
    expect(earth.look.rim).toBe(TOY.rim);
    expect(earth.look.rimColour).toBe(TOY.rimColour);
    expect(earth.look.skyLight).toBe(TOY.skyLight);
    expect(earth.look.groundLight).toBe(TOY.groundLight);
    expect(earth.look.fog.colour).toBe(HAZE.colour);
    expect(earth.look.fog.density).toBe(Math.LN2 / HAZE.halfWay);
    expect(earth.look.env).toBe('daylight');
    expect(earth.water.ocean).toBe(OCEAN);
    expect(earth.water.bands).toBe(BAND_COLOURS);
    expect(earth.water.shelf).toBe(SHELF.colour);
    expect(earth.water.stones).toBe(BANK_STONE.colours);
    expect(earth.crest).toBe(BANK_TINT.crest.to);
    expect(earth.backdrop.hill).toBe(COLOURS.hill);
    expect(earth.backdrop.mountain).toBe(COLOURS.mountain);
    expect(earth.backdrop.clouds).toBe(true);
    expect(earth.layers).toEqual({ fairway: null, rough: null, pan: null });
    expect(earth.map.water).toBe(COLOURS.waterMid);
    expect(earth.map.sand).toBe(COLOURS.sand);
  });

  it('paints the scene’s ground in the very colours it always did, roughness and all', () => {
    const made = paletteOf(earth);
    for (const key of Object.keys(made) as (keyof typeof made)[])
      expect(made[key], key).toEqual(PALETTE[key as keyof typeof PALETTE]);
  });

  it('grows the grass the turf always grew: the rough’s blades and the fairway’s green', () => {
    expect(EARTH_GRASS.rough.density).toBe(KINDS[0].density);
    expect(EARTH_GRASS.rough.height).toBe(KINDS[0].height);
    expect([...EARTH_GRASS.rough.base]).toEqual(KINDS[0].base);
    expect([...EARTH_GRASS.rough.tip]).toEqual(KINDS[0].tip);
    expect(EARTH_GRASS.fair).toEqual([0.21, 0.41, 0.0072]);
    expect(EARTH_GRASS.fair).toEqual(COLOURS.grassMown.map((c) => c / 1.11));
    const kinds = golfKindsOf(earth)!;
    expect(kinds.length).toBe(8);
    expect(kinds[0].density).toBe(80);
    expect(kinds[1].density).toBe(100);
  });

  it('lights as daylight always lit it', () => {
    const { look, fog } = lookFor(earth);
    expect(look.sunDir).toBe(SUN);
    expect(look.sunColour).toEqual([2.75, 2.55, 2.2]);
    expect(look.ambient).toBe(1);
    expect(look.exposure).toBe(1);
    expect(look.background).toBe(SKY.horizon);
    expect(look.shading).toBe('toon');
    expect(look.shadeColour).toBe(TOY.shadeColour);
    expect(fog.colour).toBe(HAZE.colour);
    expect(fog.density).toBeCloseTo(Math.LN2 / HAZE.halfWay, 12);
    expect(fog.base).toBe(-10);
    expect(fog.height).toBe(HAZE.height);
  });
});

describe('every theme', () => {
  it('has every field earth’s has, and is named for its biome', () => {
    for (const name of NAMES) {
      const t = THEMES[name];
      expect(t.name).toBe(name);
      expect(shape({ ...t, grass: null, layers: null, name: null }), name).toEqual(
        shape({ ...THEMES.earth, grass: null, layers: null, name: null }),
      );
      expect(Object.keys(t.ground).sort(), name).toEqual(Object.keys(THEMES.earth.ground).sort());
      expect(Object.keys(t.look).sort(), name).toEqual(Object.keys(THEMES.earth.look).sort());
      expect(Object.keys(t.layers).sort()).toEqual(['fairway', 'pan', 'rough']);
      expect(t.water.bands.length).toBe(4);
      expect(t.water.stones.length).toBe(3);
    }
  });

  it('has colours that are colours: finite, in range, and a sun that points somewhere', () => {
    const colour = (c: readonly number[], what: string, top = 1) => {
      expect(c.length, what).toBeGreaterThanOrEqual(3);
      for (const v of c) {
        expect(Number.isFinite(v), what).toBe(true);
        expect(v, what).toBeGreaterThanOrEqual(0);
        expect(v, what).toBeLessThanOrEqual(top);
      }
    };
    for (const t of Object.values(THEMES)) {
      for (const [k, c] of Object.entries(t.ground) as [string, readonly number[]][]) colour(c, `${t.name} ${k}`);
      colour(t.crest, `${t.name} crest`);
      t.water.bands.forEach((c, i) => colour(c, `${t.name} band ${i}`));
      colour(t.water.shelf, `${t.name} shelf`);
      t.water.stones.forEach((c, i) => colour(c, `${t.name} stone ${i}`));
      colour(t.water.ocean.body, `${t.name} body`);
      colour(t.water.ocean.tint, `${t.name} tint`);
      colour(t.backdrop.hill, `${t.name} hill`);
      colour(t.backdrop.mountain, `${t.name} mountain`);
      colour(t.map.sand, `${t.name} map sand`);
      colour(t.map.water, `${t.name} map water`);
      const l = t.look;
      colour(l.sunColour, `${t.name} sun`, 8);
      colour(l.shadeColour, `${t.name} shade`);
      colour(l.rimColour, `${t.name} rim`);
      colour(l.skyLight, `${t.name} sky light`);
      colour(l.groundLight, `${t.name} ground light`);
      colour(l.sky.zenith, `${t.name} zenith`);
      colour(l.sky.horizon, `${t.name} horizon`);
      colour(l.background, `${t.name} background`);
      colour(l.fog.colour, `${t.name} fog`);
      expect(Math.hypot(...l.sunDir), `${t.name} sun direction`).toBeGreaterThan(0.95);
      expect(Math.hypot(...l.sunDir), `${t.name} sun direction`).toBeLessThan(1.05);
      expect(l.sunDir[2], `${t.name} sun is up`).toBeGreaterThan(0.3);
      for (const n of [
        l.ambient,
        l.rim,
        l.sky.height,
        l.fog.density,
        t.water.ocean.scale,
        t.water.ocean.tilt,
        t.water.ocean.speed,
      ])
        expect(Number.isFinite(n) && n >= 0, t.name).toBe(true);
      if (t.grass) {
        colour(t.grass.rough.base, `${t.name} blade root`);
        colour(t.grass.rough.tip, `${t.name} blade tip`);
        colour(t.grass.fair, `${t.name} fairway blades`);
        expect(t.grass.rough.density).toBeGreaterThan(0);
        expect(t.grass.rough.density).toBeLessThanOrEqual(112);
      }
    }
  });

  it('wears the layers of the texture the page makes: a layer is a place in the kinds made, counted from one', () => {
    for (const t of Object.values(THEMES))
      for (const layer of [t.layers.fairway, t.layers.rough, t.layers.pan]) {
        if (!layer) continue;
        expect(Number.isInteger(layer.layer)).toBe(true);
        expect(layer.layer).toBeGreaterThan(1);
        expect(layer.layer).toBeLessThanOrEqual(TURF_KINDS.length);
        for (const v of [layer.repeat, layer.albedo, layer.shade]) expect(v).toBeGreaterThan(0);
        expect(layer.albedo).toBeLessThanOrEqual(1);
      }
    expect(TURF_KINDS[THEMES.desert.layers.rough!.layer - 1]).toBe('tuft');
    expect(TURF_KINDS[THEMES.desert.layers.pan!.layer - 1]).toBe('crack');
    expect(TURF_KINDS[THEMES.moon.layers.rough!.layer - 1]).toBe('regolith');
    expect(TURF_KINDS[THEMES.future.layers.fairway!.layer - 1]).toBe('plate');
  });

  it('is the layout’s own: a hole is read by its biome and by nothing global', () => {
    for (const name of NAMES) {
      const { game } = golfGame(
        levelHole({ name: 'a', par: 3, length: 150, ...(name === 'earth' ? {} : { biome: name }) }),
      );
      expect(themeOf(game.layout), name).toBe(THEMES[name]);
    }
  });
});

describe('the Moon’s and the future’s ground', () => {
  it('has no blades on a biome with bare ground, and kinds made once for the rest', () => {
    expect(THEMES.moon.grass).toBeNull();
    expect(THEMES.future.grass).toBeNull();
    expect(golfKindsOf(THEMES.moon)).toBeNull();
    expect(golfKindsOf(THEMES.future)).toBeNull();
    const { game } = golfGame(levelHole({ name: 'a', par: 3, length: 150, biome: 'moon' }));
    expect(bladeless(game.layout)).toBe(true);
    expect(bladeless(golfGame(levelHole({ name: 'b', par: 3, length: 150 })).game.layout)).toBe(false);
    expect(golfKindsOf(THEMES.desert)).toBe(golfKindsOf(THEMES.desert));
    expect(golfKindsOf(THEMES.desert)![0].density).toBe(14);
    expect(golfKindsOf(THEMES.earth)).toBe(golfKindsOf(THEMES.earth));
  });

  it('has a look of its own from the sky to the haze, so a hole after it must write them all back', () => {
    const earth = lookFor(THEMES.earth);
    for (const name of ['desert', 'moon', 'future'] as const) {
      const other = lookFor(THEMES[name]);
      expect(Object.keys(other.look).sort(), name).toEqual(Object.keys(earth.look).sort());
      expect(Object.keys(other.fog).sort(), name).toEqual(Object.keys(earth.fog).sort());
      expect(other.look.sky, name).not.toEqual(earth.look.sky);
      expect(other.look.sunDir, name).not.toEqual(earth.look.sunDir);
    }
    // and the Moon’s sky is black with no air to scatter, its haze next to none, the future’s at dusk
    expect(THEMES.moon.look.sky.zenith.every((c) => c < 0.05)).toBe(true);
    expect(THEMES.moon.look.fog.density).toBeLessThan(THEMES.earth.look.fog.density / 10);
    expect(THEMES.future.look.env).toBe('dusk');
    expect(THEMES.moon.backdrop.clouds).toBe(false);
  });

  it('draws the Desert’s fairway against its rough with more difference than the sheet’s: lighter and more yellow', () => {
    const light = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const d = THEMES.desert.ground;
    // the sheet’s were e6c978 against bf7f3a
    expect(light(d.grassMown) / light(d.playRough)).toBeGreaterThan(1.9);
  });
});

describe('the picture is the picture’s', () => {
  it('has no module of the game importing the theme, which is on lint’s PICTURE line', () => {
    const config = readFileSync('eslint.config.js', 'utf8');
    for (const m of ['theme', 'turf', 'tint', 'turfTexture']) expect(config, m).toMatch(new RegExp(`'${m}',`));
    const picture = new Set([...config.matchAll(/^ {2}'(\w+)',$/gm)].map((x) => x[1]).filter((m) => m !== 'models'));
    for (const file of readdirSync('src').filter((f) => f.endsWith('.ts'))) {
      const name = file.replace(/\.ts$/, '');
      if (picture.has(name) || name === 'physics') continue;
      const text = readFileSync(`src/${file}`, 'utf8');
      expect(text, `${file} is the game’s`).not.toMatch(/from '\.\/theme'/);
    }
  });
});

describe('what the smoke test holds the page to', () => {
  it('is what the themes say, so a sky reported wrong is a sky wrong', () => {
    for (const name of NAMES) {
      const want = LOOKS[name];
      const l = THEMES[name].look;
      expect(want.zenith, name).toEqual([...l.sky.zenith]);
      expect(want.horizon, name).toEqual([...l.sky.horizon]);
      expect(want.background, name).toEqual([...l.background]);
      expect(want.environment, name).toBe(l.env);
      expect(want.fog, name).toEqual([...l.fog.colour]);
      expect(want.sunDir, name).toEqual([...l.sunDir]);
      expect(want.grass, name).toBe(THEMES[name].grass !== null);
      expect(want.dust, name).toEqual([...THEMES[name].puff.grass]);
    }
  });
});

describe('the grass of a biome', () => {
  it('presses nothing on bare ground, and presses a ball in the rough where there are blades', () => {
    const hole = (biome?: 'moon' | 'desert') =>
      golfGame(levelHole({ name: 'p', par: 3, length: 150, rough: 12, ...(biome ? { biome } : {}) })).game;
    for (const [biome, pressed] of [
      [undefined, true],
      ['desert', true],
      ['moon', false],
    ] as const) {
      const { layout } = hole(biome);
      // a ball at rest in the rough, well off the fairway
      const x = layout.tee.x + 12 * 3,
        y = layout.tee.y + 6;
      expect(flattenFor(layout, x, y, true) !== null, String(biome)).toBe(pressed);
      expect(flattenFor(layout, x, y, false), `${String(biome)} not at rest`).toBeNull();
    }
  });

  it('grows a desert’s field in its own kinds: the sparse tufts, in the theme’s colours', () => {
    const { layout } = golfGame(levelHole({ name: 'f', par: 3, length: 150, biome: 'desert' })).game;
    const field = fieldOf(layout, 'f');
    expect(field.kinds[0].density).toBe(14);
    expect(field.kinds[0].tip).toEqual([...THEMES.desert.grass!.rough.tip]);
    expect(fieldOf(golfGame(levelHole({ name: 'f', par: 3, length: 150 })).game.layout, 'f').kinds[0].density).toBe(80);
  });
});

describe('the caches of the picture', () => {
  it('are made once for each biome, the same object on every ask, so there are four at the most', () => {
    for (const name of NAMES) {
      const t = THEMES[name];
      for (let k = 0; k < 20; k++) {
        expect(paletteOf(t), name).toBe(paletteOf(t));
        expect(golfKindsOf(t), name).toBe(golfKindsOf(t));
      }
    }
  });
});

describe('a theme’s textures', () => {
  it('are named for the layers the page makes', () => {
    expect(TURF_KINDS).toEqual(['mown', 'tuft', 'regolith', 'plate', 'crack']);
    expect(TURF_KINDS.length).toBeLessThanOrEqual(8);
  });
});

describe('a theme’s scenery', () => {
  it('is, on earth, the very objects the scene always drew: the scatter, the woods beyond, the far woods and the golf tree', () => {
    const set = sceneryOf(THEMES.earth);
    expect(set.scatter).toBe(SCENERY_MODELS);
    expect(set.beyond).toBe(BEYOND_MODELS);
    expect(set.far).toBe(FAR_WOODS);
    expect(set.golfTree).toBe(GOLF_TREES);
    expect(set.golfTree).toHaveLength(1);
    for (const models of [...Object.values(SCENERY_MODELS), ...Object.values(BEYOND_MODELS)])
      expect(models).toHaveLength(BUCKETS);
  });

  it('is built for a biome the first time a hole of it asks, once, and kept: one set for each biome at most', () => {
    // the future's maker for its rock is counted: a bucket calls it once, so six calls build the set, and a second ask none
    const made = THEMES.future.scenery.beyond.rock!;
    const rock = vi.fn(made);
    THEMES.future.scenery.beyond.rock = rock;
    expect(rock).not.toHaveBeenCalled();
    const first = sceneryOf(THEMES.future);
    expect(rock).toHaveBeenCalledTimes(BUCKETS);
    for (let k = 0; k < 10; k++) expect(sceneryOf(THEMES.future)).toBe(first);
    expect(rock).toHaveBeenCalledTimes(BUCKETS);
    for (const name of ['earth', 'desert'] as const) sceneryOf(THEMES[name]);
    expect(setsKept(), 'one set for each biome, four at the most').toBeLessThanOrEqual(NAMES.length);
    THEMES.future.scenery.beyond.rock = made;
  });

  it('has every kind a slot in every biome, so a part that fills one in fills in a slot that is there', () => {
    for (const name of NAMES) {
      const s = THEMES[name].scenery;
      for (const kind of ['broadleaf', 'conifer', 'bush', 'fern', 'rock'] as const) {
        expect(kind in s.scatter, `${name} scatter ${kind}`).toBe(true);
        expect(kind in s.beyond, `${name} beyond ${kind}`).toBe(true);
      }
      expect('conifer' in s.far && 'broadleaf' in s.far, `${name} far`).toBe(true);
      expect('golfTree' in s && 'drift' in s, `${name} golf tree and drift`).toBe(true);
    }
  });

  it('has no golf tree where the biome has no tree (the Moon’s), and the biome’s own figures where it has', () => {
    expect(treeOf({ biome: 'moon' })).toBeNull();
    for (const name of ['earth', 'desert', 'future'] as const)
      expect(sceneryOf(THEMES[name]).golfTree, name).toHaveLength(1);
  });

  it('may draw nothing of a kind: a hole of a biome with a kind left out is drawn, and its pieces of that kind are not', () => {
    // a theme of its own name for the test: the Moon's rock and far woods are emptied and its set built afresh
    const moon = THEMES.moon;
    const was = { rock: moon.scenery.beyond.rock, far: moon.scenery.far.conifer };
    moon.scenery.beyond.rock = null;
    moon.scenery.far.conifer = null;
    try {
      const { game } = golfGame(levelHole({ name: 'bare', par: 3, length: 150, biome: 'moon' }));
      const scene = new Scene();
      const still = scene.static(game.layout, 'bare', game.obstacles, game.cup.radius);
      expect(still.length).toBeGreaterThan(0);
      // the Moon's set was first made here, so it was made without them: no model, and not an empty one
      const set = sceneryOf(moon);
      expect(set.beyond.rock).toBeUndefined();
      expect(set.far.conifer).toBeUndefined();
      expect(set.beyond.bush).toHaveLength(BUCKETS);
      expect(set.golfTree, 'and no tree, as the biome has none').toBeNull();
    } finally {
      moon.scenery.beyond.rock = was.rock;
      moon.scenery.far.conifer = was.far;
    }
  });
});
