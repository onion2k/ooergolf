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

/** The kinds of ground, the byte a tile of a golf hole names; nought is none, the minigolf's own grass. */
export const LIE = { none: 0, tee: 1, fairway: 2, rough: 3, green: 4, sand: 5 } as const;
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
  { name: 'tee', roll: 20, keep: 0.37, bounce: 0.3, power: 1, loft: 0, wild: 1 },
  { name: 'fairway', roll: 20, keep: 0.37, bounce: 0.3, power: 0.98, loft: 0, wild: 1 },
  { name: 'rough', roll: 60, keep: 0.12, bounce: 0.08, power: 0.76, loft: 0, wild: 1.5 },
  { name: 'putting green', roll: 16, keep: 0.45, bounce: 0.3, power: 1, loft: 0, wild: 1 },
  { name: 'sand', roll: 60, keep: 0.03, bounce: 0.03, power: 0.66, loft: 6, wild: 1.25 },
];

/**
 * A landing: the slowest ball into the ground, in units a second, that is one at all (a slower is a ball rolling on),
 * and how much steeper a ball comes down scrubs more of its speed along the ground. A surface keeps `keep` of it
 * for a ball landing flat, and `keep` times e to the minus `steep` times the tangent of the angle it comes down at for
 * one steeper: a driver's shallow eleven degrees keeps about four fifths of that, and a wedge's forty-six about a fifth.
 * Fitted, with the hop, so that on the fairway a driver runs on about an eighth of its carry and a wedge a thirtieth.
 */
export const LANDING = { least: 3, steep: 1.3 } as const;
