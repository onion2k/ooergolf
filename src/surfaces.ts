/**
 * What a golf hole's ground is made of, and what each kind does to a ball that lands, rolls or lies on it, and to the
 * club that strikes it from there: content, in one table, that the layout names its tiles by, the physics is given its
 * rolls from, the game scrubs a landing by and the strike is made from. A leaf: it imports nothing, so that the
 * layout and the physics both may.
 *
 * The figures are measured, not remembered. A surface's `roll` is a steady slowing of a rolling ball, and it is also
 * the slope the surface holds a ball on (a ball rests where gravity times the sine of the slope is at most the roll:
 * asin of the roll over seventy). A fairway that took a ball to rest in a few tens of units by its roll alone would
 * be one that held it on every hill, and a ball would stop dead wherever it came down. So how far a ball runs out
 * comes from the landing's `keep`, the share of its speed along the ground that it keeps when it comes down (a
 * real ball's impact takes most of it), with a moderate roll after, which a ball rolls down a steep slope past.
 */
import { ITEM_FIGURES, type Effects } from './items';

/**
 * The kinds of ground, the byte a tile of a golf hole names; nought is none, the minigolf's own grass. `cut` is the short
 * rough round a green (its fringe) and along a fairway (the first cut): mown, but longer than either, so a little slower.
 */
export const LIE = { none: 0, tee: 1, fairway: 2, rough: 3, green: 4, sand: 5, cut: 6 } as const;
export type Lie = (typeof LIE)[keyof typeof LIE];

export interface Surface {
  name: string;
  /** How steadily it slows a rolling ball, in units a second a second, and so how steep a slope it holds a ball on. */
  roll: number;
  /**
   * The share of its speed along the ground a ball keeps when it lands on it flat, before it rolls: the rest is
   * scrubbed, and more the steeper the ball comes down (see `LANDING.steep`).
   */
  keep: number;
  /** The share of its speed into the ground a ball comes back up with: how much it hops. */
  bounce: number;
  /** The share of its speed a club strikes with, from a ball that lies on it: the rough takes a quarter. */
  power: number;
  /** How many degrees more loft the club has from it: the sand's lip stands the ball up. */
  loft: number;
  /** How much wilder the club's scatter is from it, as a multiple: the rough is hard to strike cleanly from. */
  wild: number;
}

/**
 * Each kind of ground, by `LIE`. None is the minigolf's green, whose roll is `ROLL` in `arena.ts` and sand's is
 * `SAND`'s there; a test holds them equal.
 */
export const SURFACES: readonly Surface[] = [
  { name: 'minigolf green', roll: 16, keep: 0.45, bounce: 0.3, power: 1, loft: 0, wild: 1 },
  { name: 'tee', roll: 20, keep: 0.48, bounce: 0.45, power: 1, loft: 0, wild: 1 },
  { name: 'fairway', roll: 20, keep: 0.48, bounce: 0.45, power: 0.98, loft: 0, wild: 1 },
  { name: 'rough', roll: 60, keep: 0.12, bounce: 0.08, power: 0.76, loft: 0, wild: 1.5 },
  { name: 'putting green', roll: 14, keep: 0.58, bounce: 0.45, power: 1, loft: 0, wild: 1 },
  { name: 'sand', roll: 60, keep: 0.03, bounce: 0.03, power: 0.66, loft: 6, wild: 1.25 },
  { name: 'first cut', roll: 23, keep: 0.36, bounce: 0.3, power: 0.97, loft: 0, wild: 1.1 },
];

/** The sand as the sand wedge has it: only what a club takes from it changes, and how the ball lands and rolls on it does not. */
const WEDGE_SAND: Surface = { ...SURFACES[LIE.sand], ...ITEM_FIGURES.wedge };

/**
 * The surface a club is struck from at `lie`, which is the table's own unless the sand wedge is held and the lie is sand:
 * read by the strike, the aim's carry, the time in the air and the scatter alike, so that the marker, the preview and the
 * shot agree. The landing and the roll read `SURFACES` itself.
 */
export function surfaceFor(lie: Lie, effects: Effects): Surface {
  return lie === LIE.sand && effects.has('wedge') ? WEDGE_SAND : SURFACES[lie];
}

/**
 * How fast the putting greens run, as the steady slowing of a ball rolling on one, in yards a second a second: less is
 * faster, the way a real green's speed is the distance a ball runs. `normal` is the table's own; a hole may ask for any
 * from `fast` to `slow` (`HoleDef.greens`), and the first cut round a green runs as much slower than it as it always did.
 * `fast` is 11 and not the 10.5 that an eighth off the old 12 would make: the break (`green.ts`) is held to the game's own putt
 * at every speed a hole may ask for, and at 10.5 a ball aimed straight at a putt the break says should miss begins to drop more
 * often than the model allows (a slow one the slope carries to the cup); the fastest hole, Home Stretch, runs at 11.4.
 */
export const GREENS = { fast: 11, normal: 14, slow: 19.5 } as const;

/** How steadily `lie` slows a rolling ball, in yards a second a second, on a hole whose greens run at `greens`: the table's own on all but the green and its first cut. */
export function rollOf(lie: Lie, greens: number = GREENS.normal): number {
  if (lie === LIE.green) return greens;
  if (lie === LIE.cut) return SURFACES[LIE.cut].roll * (greens / GREENS.normal);
  return SURFACES[lie].roll;
}

/**
 * A landing: the slowest ball into the ground, in units a second, that is one at all (a slower is a ball rolling on),
 * and how much steeper a ball comes down scrubs more of its speed along the ground. A surface keeps `keep` of it
 * for a ball landing flat, and `keep` times e to the minus `steep` times the tangent of the angle it comes down at for
 * one steeper: a driver's shallow eleven degrees keeps about four fifths of that, and a wedge's forty-six about a fifth.
 * Fitted, with the hop, so that on the fairway a driver runs on about a fifth of its carry, a 7-iron an eleventh and a sand wedge a thirtieth.
 */
export const LANDING = { least: 3, steep: 1.3 } as const;
