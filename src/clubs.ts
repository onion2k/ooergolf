/**
 * The clubs, what a hole pays, and what the shop asks: content. A club is a
 * putter that strikes harder than the last, and is made of something finer;
 * the figures take the hardest shot from rolling fifty units to seventy-two,
 * as far as each rolled under the drag they were first chosen with, so an
 * upgrade makes a hole easier and never makes one possible. The green slows
 * a ball steadily, so how far it rolls goes as the square of its speed, and
 * a little more speed goes a good deal further: 48 rolls as far as 58 did. What each costs is set against what a round pays: a round of the
 * course at par pays `PAY.finish` a hole, so the first upgrade is a few
 * rounds away and the last a good many.
 */
import { HARDEST_SHOT } from './arena';

export interface Club {
  id: string;
  name: string;
  /** The hardest it strikes, in units a second along the ground. */
  hardest: number;
  /** What it costs. */
  coins: number;
  gems: number;
  /** Its head's colour and finish, for the shop: the measured colours of the metals, and enamel. */
  colour: readonly [number, number, number];
  roughness: number;
}

/** The club every player starts with, and is given back by a save that has lost its own. */
export const STARTING_CLUB = 'putter';

export const CLUBS: readonly Club[] = [
  {
    id: STARTING_CLUB,
    name: 'Putter',
    hardest: HARDEST_SHOT,
    coins: 0,
    gems: 0,
    colour: [0.55, 0.56, 0.6],
    roughness: 0.35,
  },
  { id: 'brass', name: 'Brass putter', hardest: 42, coins: 40, gems: 0, colour: [0.91, 0.78, 0.42], roughness: 0.25 },
  {
    id: 'silver',
    name: 'Silver putter',
    hardest: 44,
    coins: 100,
    gems: 0,
    colour: [0.97, 0.96, 0.92],
    roughness: 0.12,
  },
  {
    id: 'enamel',
    name: 'Enamel putter',
    hardest: 46,
    coins: 220,
    gems: 1,
    colour: [0.12, 0.35, 0.85],
    roughness: 0.18,
  },
  { id: 'gold', name: 'Gold putter', hardest: 48, coins: 450, gems: 3, colour: [1.0, 0.77, 0.34], roughness: 0.08 },
];

/** A club by its id, or the starting putter for one no one sells. */
export function clubById(id: string): Club {
  return CLUBS.find((c) => c.id === id) ?? CLUBS[0];
}

/** What a hole pays: coins for finishing it, more for each stroke under par, and gems for a hole in one. */
export const PAY = { finish: 5, underPar: 5, holeInOne: 1 };

/** What a hole scored at `strokes` on a par of `par` pays; nothing for one picked up. */
export function paid(strokes: number, par: number, pickedUp: boolean): { coins: number; gems: number } {
  if (pickedUp) return { coins: 0, gems: 0 };
  return {
    coins: PAY.finish + Math.max(0, par - strokes) * PAY.underPar,
    gems: strokes === 1 ? PAY.holeInOne : 0,
  };
}
