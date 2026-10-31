/**
 * What a hole looks like in its biome: the colours of its golf ground, the crest the banks' tint goes toward, the water's bands,
 * shelf, stones and waves, the hills and mountains past it, the grass it grows (or none), the texture its ground wears and the
 * look it is lit by (sun, sky, fog, environment). The picture's side of the biome seam (`biome.ts` is the game's): every read
 * is by `layout.biome` and never a global, so a hole of one biome and a hole of another are each drawn in their own, and an
 * earth hole is drawn after a Moon hole as it always was. `THEMES.earth` is what the game was drawn in before there were
 * biomes, made of the very objects it was drawn by (`PALETTE`, `TOY`, `SKY`, `HAZE`, `SUN`, `OCEAN`, `BAND_COLOURS`), and a test
 * holds it so.
 *
 * The desert, the Moon and the future are the user's picks from the sheet of 31 October 2026 (Desert B, Moon A, Future A), with
 * the Desert fairway made more different from its rough than the sheet had it. Their figures are first ones, to be tuned with the
 * courses. A theme has every field, so putting one on after another leaves nothing of the other behind.
 *
 * Nothing here is drawn: models (a cactus, a hologram, a rock), the pan's own drawing, the crater and the quicksilver are
 * Parts 6 to 8, and a hole of any biome draws its trees, its pan and its lakes as it does now, in these colours where the
 * ground and the water take them.
 */
import type { BiomeName } from './biome';
import { HAZE, SKY, TOY } from './look';
import { PALETTE, shown } from './models/palette';
import { OCEAN } from './models/obstacles';
import { SUN } from './sun';
import { BANK_STONE, boulder, broadleaf, bush, conifer, farTree, fern, golfTree } from './models/lowpoly';
import { moonBoulder } from './models/moon';
import { DESERT, barrel, golfCactus, mesa, saguaro, scrub, tuft, tumbleweed } from './models/desert';
import type { Model } from './models/part';
import { BANK_TINT } from './tint';
import { PUFF, type Puffs } from './bursts';
import { DRIFT } from './drift';
import { ROCK_SIZE, type SceneryKind } from './scenery';
import type { TreeFigures } from './trees';

export type Rgb = readonly [number, number, number];

/** The sRGB hex of a colour as it shows on the screen, into the linear light the renderer takes. */
export function srgb(hex: string): Rgb {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}

/** The golf ground's colours, linear and without their roughness (the scene gives each its own): the keys of `models/palette.ts` the scene paints a hole from. */
export interface Ground {
  grass: Rgb;
  grassMown: Rgb;
  rough: Rgb;
  playRough: Rgb;
  oobGround: Rgb;
  puttingGreen: Rgb;
  puttingGreenMown: Rgb;
  teeBox: Rgb;
  firstCut: Rgb;
  golfSand: Rgb;
  golfSandLip: Rgb;
  /** A pan, the dried lake bed a desert plays on, and the soft lip along its edge. */
  pan: Rgb;
  panLip: Rgb;
  /** The sides of ground raised on a bank: the earth under the turf. */
  bank: Rgb;
}

/** A layer of the renderer's ground texture, and how it is worn: which layer, how many times it tiles a world unit, and how much colour and height it shows. */
export interface Layer {
  layer: number;
  repeat: number;
  albedo: number;
  shade: number;
}

/** A kind of blade the rough grows, from the root to the tip, how many to a square unit and how tall. */
export interface Blades {
  base: Rgb;
  tip: Rgb;
  density: number;
  height: number;
}

/** The sun, the sky and the haze, and the light the toon shading is made of; every field is set on every hole, so none is left from the last. */
export interface LookFigures {
  sunDir: readonly [number, number, number];
  sunColour: readonly [number, number, number];
  ambient: number;
  shadeColour: readonly [number, number, number];
  rim: number;
  rimColour: readonly [number, number, number];
  skyLight: readonly [number, number, number];
  groundLight: readonly [number, number, number];
  sky: { zenith: readonly [number, number, number]; horizon: readonly [number, number, number]; height: number };
  background: readonly [number, number, number];
  fog: { colour: readonly [number, number, number]; density: number };
  /** The environment the sky's own light is baked from (`bakeEnvironment`'s preset). */
  env: 'daylight' | 'dusk';
}

/** The kinds of scenery that have a model (the flowers are made in colours of their own, and are not toned). */
export type ModelKind = Exclude<SceneryKind, 'flowers'>;

/** A maker of one model: called once for each turn of it that is baked, so no mesh is shared between two. */
export type Maker = () => Model;

/**
 * The models a biome stands round its holes, as makers: what `scene.ts` once held at module level. A kind a biome draws nothing
 * of is `null` (the Moon's trees), and a piece of that kind is placed and then not drawn. The kinds are the pieces of
 * `scenery.ts`, which are roles and not species: a biome says what its `conifer` is (the desert's tall cactus), its `bush`, its
 * `rock`, and what stands in its far woods. The set is baked and built the first time a hole of the biome asks (`sceneryOf`,
 * `sceneryset.ts`), once, and kept.
 */
export interface Scenery {
  /** The scatter on the rough of a hole of minigolf, and a golf hole's dressing rocks. */
  scatter: Record<ModelKind, Maker | null>;
  /** The same kinds past a hole of golf, bigger, since they are seen from two hundred yards back. */
  beyond: Record<ModelKind, Maker | null>;
  /** The far woods past them and on the backdrop's hills, a unit tall to be scaled: the cheapest of each kind. */
  far: { conifer: Maker | null; broadleaf: Maker | null };
  /** A golf tree, to the figures the game tests a ball against (`treeOf(layout)`): what is seen is what the ball meets. */
  golfTree: ((tree: TreeFigures) => Model) | null;
  /** A thing that drifts over the ground on the wind and is drawn only, with no body in the world (the desert's tumbleweed). */
  drift: Maker | null;
  /** How many of the far trees on the backdrop's hills are one drawn: one for each `hills`, so one is all of them. */
  hills: number;
}

/** Earth's scenery, as the scene always drew it: a copy of the records, the very makers, so a biome may replace a slot. */
export function earthScenery(): Scenery {
  return {
    scatter: {
      broadleaf: () => broadleaf({ height: 7 }),
      conifer: () => conifer({ height: 8 }),
      bush: () => bush(1.8),
      fern: () => fern(2.2),
      rock: () => boulder(ROCK_SIZE, { colour: PALETTE.rockWarm }),
    },
    beyond: {
      broadleaf: () => broadleaf({ height: 12, seed: 4 }),
      conifer: () => conifer({ height: 15, seed: 2 }),
      bush: () => bush(2.8, { seed: 6 }),
      fern: () => fern(3.2, { seed: 8 }),
      rock: () => boulder(2.6, { seed: 9, colour: PALETTE.rockWarm }),
    },
    far: { conifer: () => farTree('conifer'), broadleaf: () => farTree('broadleaf') },
    golfTree: (tree) => golfTree(tree),
    drift: null,
    hills: 1,
  };
}

export interface Theme {
  name: BiomeName;
  ground: Ground;
  /** Where a full crest of the rough goes (`BANK_TINT.crest.to`). */
  crest: Rgb;
  water: {
    /** Whether the lake is a crater: a bowl going down dark, a pale rim round it, a deep matte pit and no ring on the surface where a ball goes in. */
    crater: boolean;
    /** The four bands of a lake, from the foam in. */
    bands: readonly (readonly number[])[];
    shelf: readonly number[];
    /** The three colours of the ring of stones. */
    stones: readonly (readonly number[])[];
    /** The open water's waves: `OCEAN`'s figures. */
    ocean: {
      scale: number;
      minigolfScale: number;
      speed: number;
      tilt: number;
      body: readonly number[];
      tint: readonly number[];
    };
  };
  /** The map's own sand and lake: a map is not toon lit, and shows the bunkers in the sand and the water in its mid colour. */
  map: { sand: Rgb; water: Rgb };
  /** The world past the hole: its hills and mountains, and whether clouds drift over it. */
  backdrop: {
    hill: Rgb;
    mountain: Rgb;
    clouds: boolean;
    /** Whether a lake lies in a gap of the hills (and the ground is hollowed for it), and how high the hills rise as a share of earth's. */
    lake: boolean;
    relief: number;
    /** Whether a black sky has stars and an Earth in it, drawn to a view that sees the sky. */
    stars: boolean;
    earth: boolean;
  };
  /** The blades the rough grows and the colour of the fairway's, or null for a biome with no grass (the ground is bare, and no blade is grown). */
  grass: { rough: Blades; fair: Rgb } | null;
  /** The texture the mown ground wears instead of the turf's (null: the turf's own), and the one the rough and out of bounds wear (null: none). */
  layers: { fairway: Layer | null; rough: Layer | null; pan: Layer | null };
  look: LookFigures;
  /** The models of the scenery (see `Scenery`). */
  scenery: Scenery;
  /** What a stroke and a ball landing throw up: the dust a desert's ground gives, a Moon's regolith, the sparks of a future's plates. Earth's is the grass and sand it always threw. */
  puff: Puffs;
  /** Whether the flag is held out rigid on a wire along its top, as a flag is where no wind blows it (the Moon's). */
  rigidFlag: boolean;
}

/** The ground of earth: the very arrays of `models/palette.ts`. */
const EARTH_GROUND: Ground = {
  grass: PALETTE.grass,
  grassMown: PALETTE.grassMown,
  rough: PALETTE.rough,
  playRough: PALETTE.playRough,
  oobGround: PALETTE.oobGround,
  puttingGreen: PALETTE.puttingGreen,
  puttingGreenMown: PALETTE.puttingGreenMown,
  teeBox: PALETTE.teeBox,
  firstCut: PALETTE.firstCut,
  golfSand: PALETTE.golfSand,
  golfSandLip: PALETTE.golfSandLip,
  pan: PALETTE.pan,
  panLip: PALETTE.panLip,
  bank: [0.2, 0.3, 0.08],
};

/** The rough's blades and the fairway's green on earth: the numbers `turf.ts`'s `KINDS` and fairway were always made of. */
export const EARTH_GRASS = {
  rough: { base: [0.1394, 0.28, 0.011], tip: [0.187, 0.371, 0.012], density: 80, height: 0.55 },
  fair: [0.21, 0.41, 0.0072],
} as const satisfies { rough: Blades; fair: Rgb };

/** Earth's look, as `daylight` always lit it. */
const EARTH_LOOK: LookFigures = {
  sunDir: SUN,
  sunColour: [2.75, 2.55, 2.2],
  ambient: 1,
  shadeColour: TOY.shadeColour,
  rim: TOY.rim,
  rimColour: TOY.rimColour,
  skyLight: TOY.skyLight,
  groundLight: TOY.groundLight,
  sky: SKY,
  background: SKY.horizon,
  fog: { colour: HAZE.colour, density: Math.LN2 / HAZE.halfWay },
  env: 'daylight',
};

/** The colours of a lake's bands on earth, from the foam in, and of the shelf the stones stand on (`waterdraw.ts` re-exports them). */
export const EARTH_BANDS = [
  shown(0.7, 0.93, 0.98),
  shown(0.32, 0.76, 0.95),
  shown(0.18, 0.62, 0.92),
  shown(0.08, 0.5, 0.89),
];
export const EARTH_SHELF = shown(0.62, 0.48, 0.36);

const earth: Theme = {
  name: 'earth',
  ground: EARTH_GROUND,
  crest: BANK_TINT.crest.to,
  water: { crater: false, bands: EARTH_BANDS, shelf: EARTH_SHELF, stones: BANK_STONE.colours, ocean: OCEAN },
  map: { sand: PALETTE.sand, water: PALETTE.waterMid },
  backdrop: {
    hill: PALETTE.hill,
    mountain: PALETTE.mountain,
    clouds: true,
    lake: true,
    relief: 1,
    stars: false,
    earth: false,
  },
  grass: EARTH_GRASS,
  layers: { fairway: null, rough: null, pan: null },
  look: EARTH_LOOK,
  scenery: earthScenery(),
  puff: PUFF,
  rigidFlag: false,
};

/** A biome's ground from the sheet's hex colours (fairway, mown fairway, rough, out of bounds, green, mown green, tee, first cut, sand, lip), and its bank a share of the rough's. */
function ground(
  [fair, mown, rough, oob, put, putMown, tee, cut, sand, lip]: string[],
  bank: number,
  pan: [string, string] = [cut, lip],
): Ground {
  const r = srgb(rough);
  return {
    grass: srgb(fair),
    grassMown: srgb(mown),
    rough: r,
    playRough: r,
    oobGround: srgb(oob),
    puttingGreen: srgb(put),
    puttingGreenMown: srgb(putMown),
    teeBox: srgb(tee),
    firstCut: srgb(cut),
    golfSand: srgb(sand),
    golfSandLip: srgb(lip),
    pan: srgb(pan[0]),
    panLip: srgb(pan[1]),
    bank: [r[0] * bank, r[1] * bank, r[2] * bank],
  };
}

const lit = (hex: string) => srgb(hex);

/**
 * The Desert, Desert B of the sheet: red earth and an oasis green. The fairway is straw and the rough a redder, darker earth than
 * the sheet's (`bf7f3a` there, `a6612f` here), so the fairway reads as a fairway from the tee: the sheet's two were near in light
 * and the fairway was lost in the rough. Everything past it is the sheet's.
 */
const desert: Theme = {
  name: 'desert',
  ground: ground(
    ['e6c978', 'dcbd68', 'a6612f', '8f5426', '7fb04a', '74a540', 'e6cf86', 'bfa650', 'a8432c', 'c75f3f'],
    0.55,
    // the pan: a pale clay, paler and greyer than the straw beside it, and a lip of the clay baked brown where it meets the red earth
    ['d6bf92', 'b58f62'],
  ),
  crest: lit('e4b45e'),
  water: {
    crater: false,
    bands: ['e6cfa0', 'd8b880', 'cfa870', 'c49a62'].map(lit),
    shelf: lit('a87c52'),
    stones: ['d8bc94', 'c49a70', 'a87c58'].map(lit),
    ocean: { ...OCEAN, body: lit('bd9058') },
  },
  map: { sand: lit('a8432c'), water: lit('c49a62') },
  backdrop: {
    hill: lit('b5703f'),
    mountain: lit('8c4630'),
    clouds: true,
    lake: true,
    relief: 1,
    stars: false,
    earth: false,
  },
  grass: {
    rough: { base: lit('9c7030'), tip: lit('dcae58'), density: 14, height: 0.8 },
    fair: lit('ceae56'),
  },
  layers: {
    fairway: null,
    rough: { layer: 2, repeat: 1 / 9, albedo: 0.3, shade: 0.24 },
    // the cracks of a dried lake: polygons about two yards across, the dark of a crack a good way into the clay's colour
    pan: { layer: 5, repeat: 1 / 10, albedo: 0.55, shade: 0.5 },
  },
  look: {
    sunDir: [0.66, 0.4, 0.63],
    sunColour: [3.05, 2.4, 1.7],
    ambient: 1,
    shadeColour: [0.55, 0.32, 0.42],
    rim: TOY.rim,
    rimColour: TOY.rimColour,
    skyLight: [0.66, 0.68, 0.82],
    groundLight: [0.62, 0.38, 0.18],
    sky: { zenith: [0.1, 0.36, 0.82], horizon: [0.98, 0.72, 0.5], height: 0.22 },
    background: [0.98, 0.72, 0.5],
    fog: { colour: [0.85, 0.6, 0.42], density: Math.LN2 / HAZE.halfWay },
    env: 'daylight',
  },
  scenery: {
    // the roles of `scenery.ts` in the desert: a conifer is a saguaro, a broadleaf a barrel cactus, a bush dry scrub, a fern a tuft
    // of straw, and a rock the red of the sheet's; and in the far ground a mesa for a conifer and a butte for a broadleaf
    scatter: {
      broadleaf: () => barrel(1.6),
      conifer: () => saguaro(7),
      bush: () => scrub(1.8),
      fern: () => tuft(2.2),
      rock: () => boulder(ROCK_SIZE, { colour: DESERT.rock }),
    },
    beyond: {
      broadleaf: () => barrel(2.6, { seed: 4 }),
      conifer: () => saguaro(13, { seed: 2 }),
      bush: () => scrub(2.8, { seed: 6 }),
      fern: () => tuft(3.2, { seed: 8 }),
      rock: () => boulder(2.6, { seed: 9, colour: DESERT.rock }),
    },
    far: { conifer: () => mesa({ seed: 1 }), broadleaf: () => mesa({ seed: 2, width: 0.5 }) },
    golfTree: (tree) => golfCactus(tree),
    drift: () => tumbleweed(DRIFT.radius),
    hills: 6,
  },
  // the dry earth the ball lands in comes up as a pale dust, and the sand of a bunker as the red it is (as particles are coloured, on
  // the screen's own scale, as `PUFF`'s are)
  puff: { grass: [0.86, 0.68, 0.44], sand: [0.8, 0.42, 0.28] },
  rigidFlag: false,
};

/** The Moon, Moon A of the sheet: a pale fairway on dark dust under a hard sun, a black sky, no blades, no clouds. */
const moon: Theme = {
  name: 'moon',
  ground: ground(
    ['b9b8b4', 'adaca8', '6c6b6e', '5a595d', 'dcdbd6', 'd0cfca', 'e8e6df', '8f8e8e', '2d2c30', '4a494d'],
    0.7,
    // no pan on the Moon: the lip is a crater's rim, the pale ejecta it throws up (and its own mid grey as it falls to the dust)
    ['8f8e8e', 'a9a8aa'],
  ),
  crest: lit('8d8c8e'),
  water: {
    crater: true,
    bands: ['4c4b4e', '37363a', '232226', '141317'].map(lit),
    shelf: lit('56555a'),
    stones: ['8c8b8e', '77767a', '636266'].map(lit),
    ocean: { ...OCEAN, body: lit('060608'), tint: lit('1c1c20'), tilt: 0.03 },
  },
  map: { sand: lit('2d2c30'), water: lit('232226') },
  // no lake past the hills (a renderer's water would be a false note on the Moon), and lower, smoother hills; a sky of stars and the Earth
  backdrop: {
    hill: lit('6e6e72'),
    mountain: lit('4a4a50'),
    clouds: false,
    lake: false,
    relief: 0.5,
    stars: true,
    earth: true,
  },
  grass: null,
  layers: { fairway: null, rough: { layer: 3, repeat: 1 / 40, albedo: 0.3, shade: 0.3 }, pan: null },
  look: {
    sunDir: [0.6, 0.34, 0.72],
    sunColour: [3.2, 3.15, 3.05],
    ambient: 0.35,
    shadeColour: [0.1, 0.11, 0.16],
    rim: 0.08,
    rimColour: TOY.rimColour,
    skyLight: [0.12, 0.13, 0.18],
    groundLight: [0.14, 0.14, 0.14],
    sky: { zenith: [0.003, 0.003, 0.01], horizon: [0.008, 0.008, 0.02], height: 0.08 },
    background: [0.005, 0.005, 0.012],
    fog: { colour: [0.01, 0.01, 0.02], density: 0.00001 },
    env: 'daylight',
  },
  scenery: {
    // no tree, and nothing of a tree's roles: the kinds that were green are rocks, a boulder, a stone and a pebble, in the Moon's greys
    scatter: {
      broadleaf: null,
      conifer: null,
      bush: () => moonBoulder(1.4, { seed: 3, stone: true }),
      fern: () => moonBoulder(0.8, { seed: 5, stone: true }),
      rock: () => moonBoulder(ROCK_SIZE, { seed: 1 }),
    },
    beyond: {
      broadleaf: null,
      conifer: null,
      bush: () => moonBoulder(2.4, { seed: 6, stone: true }),
      fern: () => moonBoulder(1.3, { seed: 8, stone: true }),
      rock: () => moonBoulder(3.4, { seed: 9 }),
    },
    // no far woods; far boulders did not read from a fly-in's distance
    far: { conifer: null, broadleaf: null },
    golfTree: null,
    drift: null,
    hills: 1,
  },
  // regolith lifted by a stroke or a landing rises as a pale grey plume and settles slowly, on a sixth of the weight; its rough lie is
  // a heavy plop, so the puff is deeper
  puff: { grass: [0.74, 0.74, 0.76], sand: [0.5, 0.5, 0.53], gravity: 0.22, life: 1.5, deep: 1.5 },
  // a world with no wind holds its flag out on a wire
  rigidFlag: true,
};

/** The Future, Future A of the sheet: bright steel at dusk, a plate texture on the ground, mirrored water, no blades. */
const future: Theme = {
  name: 'future',
  ground: ground(
    ['b4c2d0', 'a6b5c4', '7f8d9c', '6c7988', 'dbe7f2', 'cedbe8', 'eef5fb', '94a4b4', '3b4552', 'ffc83a'],
    0.6,
  ),
  crest: lit('9fb0c4'),
  water: {
    crater: false,
    bands: ['ffffff', 'e8eef4', 'd4dce4', 'c4ced8'].map(lit),
    shelf: lit('8fa0b2'),
    stones: ['dfe6ee', '8fa0b2', '6c7c8e'].map(lit),
    ocean: { ...OCEAN, body: lit('b8c4d0'), tint: lit('ffffff'), tilt: 0.06, scale: 0.18, speed: 0.15 },
  },
  map: { sand: lit('3b4552'), water: lit('d4dce4') },
  backdrop: {
    hill: lit('5a6a88'),
    mountain: lit('39456a'),
    clouds: true,
    lake: true,
    relief: 1,
    stars: false,
    earth: false,
  },
  grass: null,
  layers: {
    fairway: { layer: 4, repeat: 1 / 24, albedo: 0.6, shade: 0.35 },
    rough: { layer: 4, repeat: 1 / 24, albedo: 0.6, shade: 0.35 },
    pan: null,
  },
  look: {
    sunDir: [0.55, 0.4, 0.73],
    sunColour: [2.6, 2.4, 2.6],
    ambient: 1,
    shadeColour: [0.3, 0.26, 0.55],
    rim: 0.35,
    rimColour: [0.5, 0.9, 1],
    skyLight: [0.5, 0.5, 0.85],
    groundLight: [0.35, 0.3, 0.45],
    sky: { zenith: [0.06, 0.05, 0.28], horizon: [0.95, 0.42, 0.62], height: 0.25 },
    background: [0.95, 0.42, 0.62],
    fog: { colour: [0.5, 0.25, 0.5], density: Math.LN2 / HAZE.halfWay },
    env: 'dusk',
  },
  // Part 8 fills the future's in: holograms for trees, pylons and a skyline for the far woods
  scenery: earthScenery(),
  // Part 8: the sparks of a plate, where earth's green puff stands for them for now
  puff: PUFF,
  rigidFlag: false,
};

/** Every biome's theme. */
export const THEMES: Record<BiomeName, Theme> = { earth, desert, moon, future };

/** The theme of the biome a layout is in: what every read of a colour or a look goes through. */
export function themeOf(on: { biome: BiomeName }): Theme {
  return THEMES[on.biome];
}
