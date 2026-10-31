/**
 * What a golf hole's world is made of beyond its map: the biome a hole belongs to, and the few figures of play that differ
 * from one to the next. A leaf on the game side, with no renderer, no page and no content: the layout names its biome, and
 * everything that reads a figure for a hole reads it through here. A hole that names none is earth, the game as it was, to
 * the bit; without this seam the Moon would be a global changed in place, and every course would play on it.
 */
import { LIE, SURFACES, type Surface } from './surfaces';

export type BiomeName = 'earth' | 'desert' | 'moon' | 'future';

export interface Biome {
  name: BiomeName;
  /**
   * The world's seconds to the clock's: how fast the physics runs against the frames. One on earth. Low gravity is this and not
   * a gravity: with gravity 30 and speeds scaled by its root and rolls by itself, the game is the same game slowed by the
   * root of 30 over 70, so the clock does that and `PHYSICS.gravity` is left as it is, with every distance, the autopilot's
   * arithmetic and the rules as they were. Measured on 31 October 2026 (`ooergolf-biomes-evidence/part0.md`): a driver's
   * first landing 1.12 s on earth and 1.72 s at gravity 30 (1.53 times), the same 280 yards, and The Links 30.50 strokes a
   * round at 70 and 31.25 at 30.
   */
  pace: number;
  /** Whether there is no wind whatever the hole's spec says: its readout, its reach, the caddie's and the ball's all agree. */
  calm: boolean;
  /** The ground's figures, by `LIE`: earth's is the `SURFACES` table itself, and another biome's is a copy with rows changed. */
  surfaces: readonly Surface[];
  /**
   * What a hole's lake is. Water, a crater and a mirror are water to the game: a ball is lost in them, costs a stroke and is put
   * back, and they differ only in the words told. A pan is ground, in play: a hardpan a ball skitters across and is never lost in,
   * which the map draws `d` where earth's would draw `~`.
   */
  hazard: Hazard;
  /** The words a lake is told in: `lake` is its noun, as in "In the water!", "finds the crater", "runs into the quicksilver". */
  words: { lake: string };
}

export type Hazard = 'water' | 'pan' | 'crater' | 'mirror';

/** `SURFACES` with the rows `over` changed, by `LIE`: the rest are earth's own rows, the very objects. */
function table(over: Partial<Record<number, Partial<Surface>>>): readonly Surface[] {
  return SURFACES.map((s, lie) => (over[lie] ? { ...s, ...over[lie] } : s));
}

/**
 * Each biome. The rows of the desert's, the moon's and the future's are first figures, to be tuned with the courses that
 * use them (Parts 9 to 11 of the biomes plan): a desert's ground runs on and its rough is sparse, the moon's dust holds a
 * ball dead, and the future's plates are lively.
 */
export const BIOMES: Record<BiomeName, Biome> = {
  earth: { name: 'earth', pace: 1, calm: false, surfaces: SURFACES, hazard: 'water', words: { lake: 'water' } },
  desert: {
    name: 'desert',
    pace: 1,
    calm: false,
    surfaces: table({
      [LIE.fairway]: { keep: 0.55, roll: 18 },
      [LIE.rough]: { roll: 30, keep: 0.3, bounce: 0.2, power: 0.85, wild: 1.3 },
    }),
    // a dried lake bed: ground, so it is never told, and its word is the one a stroke is never lost to
    hazard: 'pan',
    words: { lake: 'pan' },
  },
  moon: {
    name: 'moon',
    // the root of 30 over 70, to the digit that is measured: see `Biome.pace`
    pace: 0.655,
    calm: true,
    surfaces: table({ [LIE.rough]: { keep: 0.05, bounce: 0.03, power: 0.7 } }),
    hazard: 'crater',
    words: { lake: 'crater' },
  },
  future: {
    name: 'future',
    pace: 1,
    calm: false,
    surfaces: table({
      [LIE.fairway]: { keep: 0.6, bounce: 0.6 },
      [LIE.rough]: { roll: 40, keep: 0.4, bounce: 0.45, power: 0.9, wild: 1.1 },
    }),
    hazard: 'mirror',
    words: { lake: 'quicksilver' },
  },
};

/** Whether `name` is the name of a biome: a hole is held to it, since what is read from a map or a save is read as if anyone wrote it. */
export function isBiome(name: unknown): name is BiomeName {
  return typeof name === 'string' && Object.hasOwn(BIOMES, name);
}

/** The surface table of the biome a layout (or anything that names one) is in: what every read of a ground's figures goes through. */
export function surfacesOf(on: { biome: BiomeName }): readonly Surface[] {
  return BIOMES[on.biome].surfaces;
}
