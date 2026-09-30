/**
 * The colours the models are made in, and how rough each is. A colour here
 * is written as it shows on the screen in full sun, and `shown` turns it
 * into the linear light the renderer takes: toon light shows a colour at its
 * full strength and the screen's curve lifts it, so a red written down as
 * the renderer takes it comes out salmon. A plastic at full saturation
 * glares; at about four fifths of it, as shown, it reads as a toy. The metals
 * are the renderer's own measured colours, so the cup's gold is the gold
 * every other precious thing will be. Without one palette, the obstacles
 * would each find their own red.
 */
import { metals } from 'artshape-render/render/materials';
import type { Colour } from './part';

const rgb = (c: readonly number[]): Colour => [c[0], c[1], c[2]];

/** One channel as the screen shows it, into the linear light the renderer works in: the sRGB curve, undone. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** A colour as it should show on the screen in full sun, as the renderer takes it. */
export const shown = (r: number, g: number, b: number): Colour => [linear(r), linear(g), linear(b)];

/**
 * The green's middle colour, already linear, and how much lighter and darker
 * its two mown stripes are: a vivid yellow-green, as a toy's grass is, which
 * the deep blue-green of the rough frames.
 */
const GREEN = [0.105, 0.41, 0.024] as const,
  STRIPE = 0.11;
/**
 * A golf hole's other grounds, already linear: the rough a player plays from, darker and a hair yellower than the
 * fairway that is the game's own green, and out of bounds, the dry pale grass beyond the stakes; the putting green, finer and lighter, in the same two stripes; and the tee's
 * box, paler still, mown flat.
 */
const PLAY_ROUGH = [0.056, 0.235, 0.024] as const,
  OUT_OF_BOUNDS = [0.16, 0.27, 0.045] as const,
  PUTTING = [0.15, 0.5, 0.034] as const,
  TEE_BOX = [0.19, 0.5, 0.09] as const;
/** The rail's paint, already linear: a warm timber. */
const RAIL_PAINT = [0.52, 0.25, 0.09] as const;

export const PALETTE = {
  /**
   * The game's own ground, already linear: the scene paints the course in it
   * and the showcase its patch, so the two are one green. The rough is the
   * colour between the rough's blades, as the renderer gives it for them.
   */
  grass: rgb(GREEN.map((c) => c * (1 - STRIPE))),
  grassMown: rgb(GREEN.map((c) => c * (1 + STRIPE))),
  rough: [0.0455882, 0.1823529, 0.0694118] as Colour,
  playRough: rgb(PLAY_ROUGH),
  oobGround: rgb(OUT_OF_BOUNDS),
  puttingGreen: rgb(PUTTING.map((c) => c * (1 - STRIPE))),
  puttingGreenMown: rgb(PUTTING.map((c) => c * (1 + STRIPE))),
  teeBox: rgb(TEE_BOX),
  /**
   * The rail's timber sides, and the cap painted along its top, rounded over
   * its edges: one paint, the sides two thirds as bright, so a side in shade
   * differs from the cap in the sun only by the light, and the shade's cool
   * is the light's.
   */
  rail: rgb(RAIL_PAINT.map((c) => c * 0.68)),
  railCap: rgb(RAIL_PAINT),

  /** Bright glossy plastic, for everything the ball meets. */
  plastic: {
    red: shown(0.93, 0.2, 0.17),
    orange: shown(0.98, 0.52, 0.16),
    yellow: shown(0.99, 0.8, 0.2),
    lime: shown(0.52, 0.86, 0.17),
    blue: shown(0.18, 0.5, 0.93),
    purple: shown(0.62, 0.22, 0.92),
    pink: shown(0.96, 0.22, 0.58),
    teal: shown(0.15, 0.76, 0.72),
  },
  /** White plastic, a little warm, since a pure white glares under a toon sun. */
  cream: shown(0.97, 0.94, 0.86),

  gold: rgb(metals.gold.f0),
  silver: rgb(metals.silver.f0),
  /** The inside of the cup: nearly black, so the hole reads as deep. */
  hole: shown(0.1, 0.1, 0.11),

  /**
   * The pond, from its foam to its deep: a step darker toward the middle, as water is, and veined in the light that
   * a bright sun throws through its ripples. The ripples that spread on it are a pale blue that fades to the water's
   * own, and not white, which is an outline.
   */
  water: shown(0.1, 0.42, 0.88),
  waterMid: shown(0.16, 0.56, 0.93),
  waterShallow: shown(0.34, 0.78, 0.95),
  waterFoam: shown(0.94, 0.99, 1.0),
  waterVein: shown(0.3, 0.68, 0.97),
  ripple: shown(0.62, 0.86, 1.0),
  /**
   * The bunker's sand, raked in stripes of two tones, a warm gold and not a lemon; a grain that is a shade darker and
   * no more; and a lip lit on its outside and shaded on its inside, so it stands up off the grass and the sand.
   */
  sand: shown(0.95, 0.78, 0.46),
  sandRaked: shown(0.9, 0.7, 0.38),
  sandGrain: shown(0.91, 0.72, 0.4),
  sandLip: shown(1.0, 0.88, 0.58),
  sandLipInner: shown(0.8, 0.6, 0.34),
  belt: shown(0.2, 0.2, 0.24),
  steel: shown(0.74, 0.77, 0.82),

  windmillWall: shown(0.98, 0.9, 0.72),
  windmillDoor: shown(0.3, 0.17, 0.1),
  roof: shown(0.86, 0.26, 0.18),

  trunk: shown(0.55, 0.33, 0.16),
  leaves: shown(0.22, 0.52, 0.14),
  /** A round tree's crown, lighter than the puffs below it, as a canopy is lit from above. */
  leavesLight: shown(0.4, 0.68, 0.2),
  pine: shown(0.1, 0.44, 0.34),
  /** Clipped box: a fresher green than the trees, so a hedge reads as kept and not wild. */
  hedge: shown(0.2, 0.56, 0.24),
  stem: shown(0.26, 0.56, 0.18),
  /** A pebble: a warm stone and not a cool grey, so it keeps a colour in the shade; darker than a cream, which glared in the rough. */
  rock: shown(0.64, 0.61, 0.56),
  paint: shown(0.98, 0.97, 0.95),
  string: shown(0.94, 0.92, 0.86),
} as const satisfies Record<string, Colour | Record<string, Colour>>;

/** The colours a flag comes in. */
export const FLAG_COLOURS = {
  red: PALETTE.plastic.red,
  yellow: PALETTE.plastic.yellow,
  blue: PALETTE.plastic.blue,
  pink: PALETTE.plastic.pink,
  orange: PALETTE.plastic.orange,
} as const;

/** The colours flowers bloom in, brighter than plastic since they are small. */
export const FLOWER_COLOURS: readonly Colour[] = [
  shown(0.97, 0.3, 0.6),
  shown(1.0, 0.85, 0.2),
  shown(0.66, 0.35, 0.96),
  shown(0.98, 0.97, 0.95),
  shown(0.98, 0.5, 0.15),
];

/** The colours bunting's pennants go round. */
export const PENNANT_COLOURS: readonly Colour[] = [
  PALETTE.plastic.red,
  PALETTE.plastic.yellow,
  PALETTE.plastic.blue,
  PALETTE.plastic.lime,
];

/** How rough each kind of surface is: plastic is glossy and takes a highlight, sand and leaves take none. */
export const ROUGH = {
  plastic: 0.28,
  metal: 0.22,
  water: 0.08,
  paint: 0.5,
  wood: 0.8,
  leaves: 0.85,
  sand: 0.95,
  rock: 0.9,
  rubber: 0.7,
} as const;
